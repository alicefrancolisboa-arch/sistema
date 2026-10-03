package br.com.tempodecrescer;

import android.content.*;
import android.content.pm.*;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import org.json.*;
import java.util.*;
import java.io.ByteArrayOutputStream;

/** Only app identity and icons; never screen content. */
public final class AppCatalog {
    static JSONArray cached; static long cachedAt;
    public static JSONObject app(Context ctx,String pkg)throws Exception {
        PackageManager pm=ctx.getPackageManager();
        String name=pm.getApplicationLabel(pm.getApplicationInfo(pkg,0)).toString();
        JSONObject result=new JSONObject().put("package",pkg).put("name",name.substring(0,Math.min(100,name.length())));
        try {Drawable icon=pm.getApplicationIcon(pkg);Bitmap bitmap=Bitmap.createBitmap(24,24,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);icon.setBounds(0,0,24,24);icon.draw(canvas);ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.WEBP,50,out);bitmap.recycle();String encoded="data:image/webp;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);if(encoded.length()<=2100)result.put("icon",encoded);}catch(Exception ignored){}
        return result;
    }
    public static synchronized JSONArray list(Context ctx)throws Exception {
        if(cached!=null&&System.currentTimeMillis()-cachedAt<600000)return cached;
        PackageManager pm=ctx.getPackageManager();Set<String> excluded=new HashSet<>(Arrays.asList(ctx.getPackageName(),"com.android.settings","com.android.systemui","com.android.phone"));
        android.telecom.TelecomManager tel=(android.telecom.TelecomManager)ctx.getSystemService(Context.TELECOM_SERVICE);if(tel!=null)excluded.add(tel.getDefaultDialerPackage());
        ResolveInfo home=pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),PackageManager.MATCH_DEFAULT_ONLY);if(home!=null)excluded.add(home.activityInfo.packageName);
        TreeMap<String,JSONObject> apps=new TreeMap<>();Set<String> seen=new HashSet<>();
        for(ResolveInfo r:pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)){String pkg=r.activityInfo.packageName;if(excluded.contains(pkg)||!seen.add(pkg))continue;try{JSONObject a=app(ctx,pkg);apps.put(a.getString("name").toLowerCase(Locale.ROOT)+pkg,a);}catch(Exception ignored){}}
        cached=new JSONArray();for(JSONObject a:apps.values()){if(cached.length()>=300)break;cached.put(a);}cachedAt=System.currentTimeMillis();return cached;
    }
}
