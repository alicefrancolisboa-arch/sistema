package br.com.tempodecrescer;

import android.content.Context;
import android.util.Base64;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.CertificateFactory;

/** Only authenticated, data-only web UI bundles are accepted. No native code loading. */
public final class BundleUpdates {
    public static final int NATIVE_VERSION=2;
    private static final int MAX=2*1024*1024;
    static byte[] read(InputStream in)throws Exception {try(InputStream stream=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=stream.read(b))!=-1){out.write(b,0,n);if(out.size()>MAX)throw new IOException("Atualização muito grande.");}return out.toByteArray();}}
    static JSONObject verify(Context context,byte[] bytes)throws Exception {
        JSONObject obj=new JSONObject(new String(bytes,"UTF-8"));long version=obj.getLong("version");int nativeVersion=obj.getInt("minNative");String html=obj.getString("html");
        if(version<1||nativeVersion>NATIVE_VERSION||nativeVersion<1||html.length()<100)throw new IOException("Esta atualização precisa de uma versão mais nova do aplicativo.");
        Signature verifier=Signature.getInstance("SHA256withRSA");
        try(InputStream cert=context.getAssets().open("update-cert.der")){verifier.initVerify(CertificateFactory.getInstance("X.509").generateCertificate(cert).getPublicKey());}
        verifier.update((version+"\n"+nativeVersion+"\n"+html).getBytes("UTF-8"));
        if(!verifier.verify(Base64.decode(obj.getString("signature"),Base64.NO_WRAP)))throw new IOException("Assinatura da atualização inválida.");return obj;
    }
    public static JSONObject current(Context context)throws Exception {
        JSONObject built=verify(context,read(context.getAssets().open("mobile-bundle.json")));File cache=new File(context.getFilesDir(),"mobile-bundle.json");
        if(cache.isFile())try{JSONObject cached=verify(context,read(new FileInputStream(cache)));if(cached.getLong("version")>=built.getLong("version"))return cached;}catch(Exception ignored){}
        return built;
    }
    public static boolean refresh(Context context)throws Exception {
        Store store=new Store(context);String base=store.prefs.getString("server",Remote.DEFAULT_URL);URI uri=new URI(base);if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null)throw new IOException("Servidor seguro ainda não configurado.");
        HttpURLConnection connection=(HttpURLConnection)new URL(base+"/mobile-bundle.json").openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(65000);connection.setInstanceFollowRedirects(false);
        try{if(connection.getResponseCode()!=200)throw new IOException("Atualização indisponível. Mantida a versão local.");byte[] bytes=read(connection.getInputStream());JSONObject next=verify(context,bytes),old=current(context);if(next.getLong("version")<=old.getLong("version"))return false;
            File temp=new File(context.getFilesDir(),"mobile-bundle.pending"),target=new File(context.getFilesDir(),"mobile-bundle.json");try(FileOutputStream out=new FileOutputStream(temp)){out.write(bytes);out.getFD().sync();}Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);return true;
        }finally{connection.disconnect();}
    }
}
