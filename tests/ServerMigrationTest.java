package br.com.tempodecrescer;

import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;

public class ServerMigrationTest {
    static SharedPreferences preferences(Map<String,Object> values) {
        SharedPreferences.Editor editor=(SharedPreferences.Editor)Proxy.newProxyInstance(
            SharedPreferences.Editor.class.getClassLoader(),new Class[]{SharedPreferences.Editor.class},
            (proxy,method,args)->{
                if(method.getName().startsWith("put")){values.put((String)args[0],args[1]);return proxy;}
                if(method.getName().equals("apply"))return null;
                throw new UnsupportedOperationException(method.getName());
            });
        return (SharedPreferences)Proxy.newProxyInstance(SharedPreferences.class.getClassLoader(),
            new Class[]{SharedPreferences.class},(proxy,method,args)->{
                if(method.getName().equals("edit"))return editor;
                if(method.getName().startsWith("get"))return values.getOrDefault(args[0],args[1]);
                throw new UnsupportedOperationException(method.getName());
            });
    }
    static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args) {
        Map<String,Object> values=new HashMap<>();
        values.put("server","https://tempo-de-crescer.onrender.com/");
        values.put("token","existing-child-token");values.put("localToken","existing-local-token");
        values.put("childId","existing-child");values.put("pinHash","existing-pin-hash");
        SharedPreferences prefs=preferences(values);
        Remote.migrateServer(prefs);
        check(values.get("server").equals(Remote.DEFAULT_URL));
        check(values.get("token").equals("existing-child-token"));
        check(values.get("localToken").equals("existing-local-token"));
        check(values.get("childId").equals("existing-child"));
        check(values.get("pinHash").equals("existing-pin-hash"));
        values.put("server","https://tempo-de-crescer.onrender.com");
        Remote.migrateServer(prefs);
        check(values.get("server").equals("https://tempo-de-crescer.onrender.com"));
        Map<String,Object> custom=new HashMap<>();custom.put("server","https://custom.example");
        Remote.migrateServer(preferences(custom));check(custom.get("server").equals("https://custom.example"));
        Map<String,Object> fresh=new HashMap<>();Remote.migrateServer(preferences(fresh));
        check(fresh.get("server").equals(Remote.DEFAULT_URL));
        System.out.println("Server migration: existing tokens, PIN and child preserved; custom URL and manual rollback preserved.");
    }
}
