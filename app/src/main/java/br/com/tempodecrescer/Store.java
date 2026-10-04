package br.com.tempodecrescer;

import android.content.*;
import android.app.*;
import android.app.usage.*;
import android.os.Process;
import android.provider.Settings;
import org.json.*;
import java.util.*;
import java.security.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import android.util.Base64;

public final class Store {
    public final SharedPreferences prefs;
    final Context ctx;
    public Store(Context c) { ctx=c; prefs=c.getSharedPreferences("family",0);if(prefs.getInt("pinPolicy",0)<2)try{JSONObject pin=new JSONObject(new String(BundleUpdates.read(c.getAssets().open("bootstrap-pin.json")),"UTF-8"));prefs.edit().putString("pinHash",pin.getString("hash")).putString("pinSalt",pin.getString("salt")).putInt("pinPolicy",2).apply();}catch(Exception ignored){} }
    public JSONObject config() { try { return new JSONObject(prefs.getString("config", "{\"limit\":120,\"enabled\":true,\"rest\":false,\"start\":1260,\"end\":420,\"apps\":[],\"tasks\":[]}")); } catch(Exception e) { return new JSONObject(); } }
    public void config(JSONObject obj) { synchronized(Store.class){try{recordMetering(obj);}catch(Exception ignored){}prefs.edit().putString("config",obj.toString()).apply();} }
    private long lastMetered;
    private JSONObject meterRule(JSONObject c,long at)throws Exception {JSONObject r=new JSONObject().put("at",at).put("apps",c.optJSONArray("apps")==null?new JSONArray():c.getJSONArray("apps")).put("enabled",c.optBoolean("enabled",true)).put("blocked",c.optBoolean("blocked",false));if(c.has("release"))r.put("release",c.getJSONObject("release"));return r;}
    private JSONArray meterHistory()throws Exception {JSONArray h=new JSONArray(prefs.getString("meterHistory","[]"));if(h.length()==0){JSONObject old=meterRule(config(),0);old.remove("release");h.put(old);h.put(meterRule(config(),System.currentTimeMillis()));prefs.edit().putString("meterHistory",h.toString()).apply();}return h;}
    private void recordMetering(JSONObject next)throws Exception {JSONArray h=meterHistory();JSONObject last=new JSONObject(h.getJSONObject(h.length()-1).toString()),rule=meterRule(next,System.currentTimeMillis());last.remove("at");JSONObject compare=new JSONObject(rule.toString());compare.remove("at");if(!last.toString().equals(compare.toString()))h.put(rule);Calendar midnight=Calendar.getInstance();midnight.set(Calendar.HOUR_OF_DAY,0);midnight.set(Calendar.MINUTE,0);midnight.set(Calendar.SECOND,0);midnight.set(Calendar.MILLISECOND,0);int keep=0;for(int i=0;i<h.length();i++)if(h.getJSONObject(i).getLong("at")<midnight.getTimeInMillis())keep=i;JSONArray pruned=new JSONArray();for(int i=keep;i<h.length();i++)pruned.put(h.get(i));prefs.edit().putString("meterHistory",pruned.toString()).apply();}
    private Set<String> packages(JSONArray a){Set<String> out=new HashSet<>();for(int i=0;a!=null&&i<a.length();i++)out.add(a.optString(i));return out;}
    private Metering meter(){synchronized(Store.class){List<Metering.Rule> rules=new ArrayList<>();try{JSONArray history=meterHistory();for(int i=0;i<history.length();i++){JSONObject r=history.getJSONObject(i),release=r.optJSONObject("release");rules.add(new Metering.Rule(r.getLong("at"),packages(r.optJSONArray("apps")),r.optBoolean("enabled",true),r.optBoolean("blocked"),release!=null&&release.optBoolean("all"),packages(release==null?null:release.optJSONArray("apps")),release==null?-1:release.optLong("until",-1)));}}catch(Exception ignored){}return new Metering(rules);}}

    public JSONObject state() { try { return new JSONObject(prefs.getString("state","{}")); } catch(Exception e) { return new JSONObject(); } }
    public void state(JSONObject o) { prefs.edit().putString("state",o.toString()).apply(); }
    public static String day() { return new java.text.SimpleDateFormat("yyyy-MM-dd",Locale.US).format(new Date()); }
    public boolean paired() { return !prefs.getString("token", "").isEmpty(); }
    public boolean parent() { return prefs.getString("role","child").equals("parent"); }
    public boolean selected(String pkg) { JSONArray a=config().optJSONArray("apps"); if(a!=null)for(int i=0;i<a.length();i++)if(pkg.equals(a.optString(i)))return true; return false; }
    public int bonus() { JSONObject s=state(); return day().equals(s.optString("day")) ? s.optInt("bonus",0):0; }
    public boolean usageAllowed() { return ((AppOpsManager)ctx.getSystemService(Context.APP_OPS_SERVICE)).checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName()) == AppOpsManager.MODE_ALLOWED; }
    public boolean guardEnabled() { String s=Settings.Secure.getString(ctx.getContentResolver(),Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES); return s!=null && s.contains(ctx.getPackageName()+"/"); }
    public Map<String,Long> usage() {
        Calendar cal=Calendar.getInstance(); cal.set(Calendar.HOUR_OF_DAY,0);cal.set(Calendar.MINUTE,0);cal.set(Calendar.SECOND,0);cal.set(Calendar.MILLISECOND,0);
        long start=cal.getTimeInMillis(), now=System.currentTimeMillis(); UsageReducer reducer=new UsageReducer(start),charged=new UsageReducer(start,meter());lastMetered=0;
        if(!usageAllowed())return reducer.totals;
        UsageEvents events=((UsageStatsManager)ctx.getSystemService(Context.USAGE_STATS_SERVICE)).queryEvents(start-86400000L,now);
        if(events!=null){ UsageEvents.Event e=new UsageEvents.Event(); while(events.hasNextEvent()){events.getNextEvent(e); reducer.event(e.getPackageName(),e.getEventType(),e.getTimeStamp());charged.event(e.getPackageName(),e.getEventType(),e.getTimeStamp());} }
        for(long value:charged.finish(now).values())lastMetered+=value;return reducer.finish(now);
    }
    public long used(Map<String,Long> totals) { return lastMetered; }
    public long otherUsed(){JSONObject st=state();return day().equals(st.optString("day"))?st.optLong("otherUsed",0):0;}
    public String reason(String pkg,long used) { JSONObject c=config();JSONObject release=c.optJSONObject("release");if(release!=null){JSONArray list=release.optJSONArray("apps");String[] apps=new String[list==null?0:list.length()];for(int i=0;i<apps.length;i++)apps[i]=list.optString(i);if(Policy.released(System.currentTimeMillis(),release.optLong("until",-1),release.optBoolean("all"),pkg,apps))return "";}if(selected(pkg)&&c.optBoolean("blocked",false))return "Pausa definida pelo responsável";Calendar t=Calendar.getInstance(); return Policy.reason(c.optBoolean("enabled",true),selected(pkg),used+otherUsed(),c.optInt("limit",120)+bonus(),c.optBoolean("rest"),t.get(Calendar.HOUR_OF_DAY)*60+t.get(Calendar.MINUTE),c.optInt("start",1260),c.optInt("end",420)); }
    public boolean hasPin(){return prefs.contains("pinHash");}
    private String hash(String pin,byte[] salt)throws Exception {return Base64.encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(new PBEKeySpec(pin.toCharArray(),salt,60000,256)).getEncoded(),Base64.NO_WRAP);}
    public void setPin(String pin)throws Exception {byte[] salt=new byte[24];new SecureRandom().nextBytes(salt);prefs.edit().putString("pinSalt",Base64.encodeToString(salt,Base64.NO_WRAP)).putString("pinHash",hash(pin,salt)).apply();}
    public boolean checkPin(String pin){try{return MessageDigest.isEqual(hash(pin,Base64.decode(prefs.getString("pinSalt",""),Base64.NO_WRAP)).getBytes("UTF-8"),prefs.getString("pinHash","").getBytes("UTF-8"));}catch(Exception e){return false;}}
    public void localTask(String id,String action)throws Exception {
        JSONObject s=state();if(!day().equals(s.optString("day")))s=new JSONObject().put("day",day()).put("bonus",0).put("claims",new JSONObject());
        JSONObject claims=s.optJSONObject("claims");if(claims==null)claims=new JSONObject();String status=claims.optString(id,"");
        if(action.equals("claim") && !status.equals("approved"))claims.put(id,"pending");
        if(action.equals("approve") && status.equals("pending")) { JSONArray tasks=config().optJSONArray("tasks");for(int i=0;tasks!=null&&i<tasks.length();i++){JSONObject task=tasks.getJSONObject(i);if(id.equals(task.optString("id"))){s.put("bonus",s.optInt("bonus")+task.optInt("minutes"));claims.put(id,"approved");}} }
        if(action.equals("reject") && status.equals("pending"))claims.put(id,"rejected");
        s.put("claims",claims);state(s);
    }
}
