package br.com.tempodecrescer;

import android.content.Context;
import org.json.*;
import java.net.*;
import java.io.*;
import java.util.concurrent.*;

public final class Remote {
    public static final ExecutorService IO=Executors.newSingleThreadExecutor();
    // Filled with the verified deployment URL before delivery when hosting is available.
    public static final String DEFAULT_URL="https://tempo-de-crescer.onrender.com";
    public interface Done {void done(String error);}
    public static JSONObject call(Store s,String path,JSONObject body)throws Exception {
        String base=s.prefs.getString("server",DEFAULT_URL).trim();
        if(!base.startsWith("https://"))throw new IOException("Informe o endereço HTTPS do servidor em Conexão.");
        HttpURLConnection c=(HttpURLConnection)new URL(base+path).openConnection();
        c.setConnectTimeout(15000);c.setReadTimeout(65000);c.setInstanceFollowRedirects(false);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
        boolean privileged=path.startsWith("/api/parent/")||path.equals("/api/code");
        c.setRequestProperty("Authorization","Bearer "+s.prefs.getString(privileged&&!s.parent()?"localToken":"token",""));
        if(privileged&&s.parent()&&!body.has("childId"))body.put("childId",s.prefs.getString("childId",""));
        try {try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes("UTF-8"));}
            int status=c.getResponseCode();InputStream in=status<400?c.getInputStream():c.getErrorStream();ByteArrayOutputStream out=new ByteArrayOutputStream();if(in!=null){try(InputStream stream=in){byte[] b=new byte[4096];int n;while((n=stream.read(b))!=-1){out.write(b,0,n);if(out.size()>8388608)throw new IOException("Resposta muito grande");}}}
            JSONObject result=new JSONObject(out.toString("UTF-8"));if(status>=400)throw new IOException(result.optString("error","Falha na conexão ("+status+")"));return result;
        } finally {c.disconnect();}
    }
    public static void sync(Context ctx,Done done){ IO.execute(()->{String error=null;try{Store s=new Store(ctx);JSONObject body=new JSONObject();
        if(!s.parent()){body.put("used",s.used(s.usage())).put("day",Store.day()).put("usageAllowed",s.usageAllowed()).put("guardEnabled",s.guardEnabled());
          if(System.currentTimeMillis()-s.prefs.getLong("catalogSent",0)>600000)body.put("catalog",AppCatalog.list(ctx));
          if(s.guardEnabled()&&System.currentTimeMillis()-GuardService.observedAt<10000){String pkg=GuardService.foreground;try{body.put("activity",pkg.isEmpty()?JSONObject.NULL:AppCatalog.app(ctx,pkg).put("blocked",GuardService.foregroundBlocked));}catch(Exception ignored){body.put("activity",JSONObject.NULL);}}
}
        JSONObject r=call(s,s.parent()?"/api/parent/sync":"/api/child/sync",body);if(body.has("catalog"))s.prefs.edit().putLong("catalogSent",System.currentTimeMillis()).apply();if(r.has("catalog"))s.prefs.edit().putString("catalog",r.getJSONArray("catalog").toString()).apply();s.config(r.getJSONObject("config"));s.state(r.getJSONObject("state"));s.prefs.edit().putString("childId",r.optString("childId")).putString("childName",r.optString("name")).putLong("lastSync",System.currentTimeMillis()).putString("syncError","").apply();
    }catch(Exception e){error=e.getMessage();new Store(ctx).prefs.edit().putString("syncError",error==null?"Falha de conexão":error).apply();} if(done!=null)done.done(error);}); }
}
