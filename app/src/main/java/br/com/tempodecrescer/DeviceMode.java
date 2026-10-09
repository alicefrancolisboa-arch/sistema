package br.com.tempodecrescer;

import android.app.*;
import android.content.SharedPreferences;
import android.widget.Toast;
import org.json.JSONObject;

final class DeviceMode {
    static void choose(Activity activity,Store store,String pin,Runnable ready,Runnable cancel){
        new AlertDialog.Builder(activity).setTitle("Este aparelho é de quem?")
            .setMessage("A escolha define o modo deste aparelho. No navegador, o painel é sempre do responsável."+(store.paired()&&store.parent()?" O modo criança usará o perfil "+store.prefs.getString("childName","selecionado")+".":""))
            .setPositiveButton("Do responsável",(d,w)->apply(activity,store,pin,"parent",ready,cancel))
            .setNegativeButton("Da criança",(d,w)->apply(activity,store,pin,"child",ready,cancel))
            .setOnCancelListener(d->cancel.run()).show();
    }
    static void apply(Activity activity,Store store,String pin,String mode,Runnable ready,Runnable cancel){
        if(!store.paired()||mode.equals(store.parent()?"parent":"child")){
            store.prefs.edit().putString("role",mode).putBoolean("roleChosen",true).apply();ready.run();return;
        }
        // Keep the original child credentials for a later return to this device's profile.
        final String oldToken=store.prefs.getString("token","");final boolean wasParent=store.parent();
        Remote.IO.execute(()->{try{
            JSONObject body=new JSONObject().put("mode",mode).put("pin",pin)
                .put("childId",store.prefs.getString("childId",""))
                .put("deviceToken",store.prefs.getString("childToken",wasParent?"":oldToken));
            JSONObject r=Remote.call(store,"/api/device/mode",body);
            if(activity.isFinishing()||activity.isDestroyed())return;
            activity.runOnUiThread(()->{
                SharedPreferences.Editor e=store.prefs.edit().putString("role",mode).putBoolean("roleChosen",true)
                    .putString("token",r.optString("token")).putString("childId",r.optString("childId"))
                    .putString("childName",r.optString("name")).putLong("catalogSent",0);
                if(!wasParent)e.putString("childToken",oldToken);
                if(mode.equals("child"))e.putString("childToken",r.optString("token"));
                if(r.has("localToken"))e.putString("localToken",r.optString("localToken"));
                e.apply();store.config(r.optJSONObject("config"));store.state(r.optJSONObject("state"));ready.run();
            });
        }catch(Exception ex){activity.runOnUiThread(()->{Toast.makeText(activity,ex.getMessage(),Toast.LENGTH_LONG).show();cancel.run();});}});
    }
}
