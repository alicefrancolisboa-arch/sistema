package br.com.tempodecrescer;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.text.InputType;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.ByteArrayInputStream;
import java.util.*;

public class PanelActivity extends Activity {
    WebView web;Store store;long authorizedUntil;boolean busy,askingPin;TextView status;
    static final Set<String> PARENT_PATHS=new HashSet<>(Arrays.asList("/api/parent/delete","/api/parent/restore","/api/parent/apps","/api/parent/app-policy","/api/parent/list","/api/parent/sync","/api/parent/config","/api/parent/approve","/api/parent/reject","/api/parent/rename","/api/parent/invite","/api/parent/block","/api/parent/release","/api/pair"));
    @Override public void onCreate(Bundle saved){super.onCreate(saved);store=new Store(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(6,16,25));root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});setContentView(root);root.requestApplyInsets();
        LinearLayout bar=new LinearLayout(this);Button local=new Button(this);local.setAllCaps(false);local.setText("Ajustes do aparelho");local.setOnClickListener(v->{startActivity(new Intent(this,MainActivity.class).putExtra("native",true));finish();});bar.addView(local);status=new TextView(this);status.setText("Painel da família");status.setTextColor(Color.rgb(185,243,107));status.setPadding(12,16,4,4);bar.addView(status);root.addView(bar);
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setDomStorageEnabled(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);WebView.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}@Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){if(r.getUrl().toString().equals("https://appassets.androidplatform.net/crest.jpg"))try{return new WebResourceResponse("image/jpeg",null,getAssets().open("crest.jpg"));}catch(Exception ignored){}return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}});
        web.addJavascriptInterface(new Bridge(),"FamilyNative");load();checkUpdate(false);
    }
    void load(){try{JSONObject bundle=BundleUpdates.current(this);status.setText("Painel v"+bundle.getLong("version"));web.loadDataWithBaseURL("https://appassets.androidplatform.net/panel/",bundle.getString("html"),"text/html","UTF-8",null);}catch(Exception e){status.setText("Abra os ajustes locais");Toast.makeText(this,"Não foi possível abrir o painel.",Toast.LENGTH_LONG).show();}}
    void checkUpdate(boolean apply){Remote.IO.execute(()->{try{boolean changed=BundleUpdates.refresh(this);runOnUiThread(()->{if(isFinishing())return;if(apply)load();else if(changed)status.setText("Nova tela pronta • reabra o painel");});}catch(Exception e){if(apply)runOnUiThread(()->Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show());}});}
    @Override protected void onPause(){authorizedUntil=0;super.onPause();}
    @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("FamilyNative");web.destroy();}super.onDestroy();}
    void result(String id,JSONObject data,String error){if(isFinishing()||isDestroyed())return;try{JSONObject reply=new JSONObject().put("id",id).put("ok",error==null);if(data!=null)reply.put("data",data);if(error!=null)reply.put("error",error);web.evaluateJavascript("window.nativeReply("+reply.toString()+")",null);}catch(Exception ignored){}}
    JSONObject snapshot()throws Exception {return new JSONObject().put("catalog",new JSONArray(store.prefs.getString("catalog","[]"))).put("role",store.parent()?"parent":"child").put("childId",store.prefs.getString("childId","")).put("name",store.prefs.getString("childName","Criança")).put("config",store.config()).put("state",store.state()).put("lastSync",store.prefs.getLong("lastSync",0));}
    void remember(JSONObject r){if(r.has("catalog"))store.prefs.edit().putString("catalog",r.optJSONArray("catalog").toString()).apply();if(r.has("config"))store.config(r.optJSONObject("config"));if(r.has("state"))store.state(r.optJSONObject("state"));android.content.SharedPreferences.Editor e=store.prefs.edit().putLong("lastSync",System.currentTimeMillis());if(r.has("childId"))e.putString("childId",r.optString("childId"));if(r.has("name"))e.putString("childName",r.optString("name"));if(r.has("token"))e.putString("token",r.optString("token"));e.apply();r.remove("token");r.remove("localToken");}
    void gate(Runnable action,Runnable cancel){if(System.currentTimeMillis()<authorizedUntil){action.run();return;}if(askingPin){cancel.run();return;}if(!store.hasPin()){Toast.makeText(this,"Crie o PIN nos ajustes do aparelho.",Toast.LENGTH_LONG).show();cancel.run();return;}if(System.currentTimeMillis()<store.prefs.getLong("pinWait",0)){Toast.makeText(this,"Aguarde um minuto para tentar novamente.",Toast.LENGTH_LONG).show();cancel.run();return;}
        askingPin=true;EditText pin=new EditText(this);pin.setSingleLine();pin.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD);pin.setHint("PIN do responsável");AlertDialog d=new AlertDialog.Builder(this).setTitle("Acesso do responsável").setView(pin).setNegativeButton("Cancelar",(a,b)->{askingPin=false;cancel.run();}).setPositiveButton("Entrar",null).setOnCancelListener(v->{askingPin=false;cancel.run();}).create();
        d.setOnShowListener(v->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w->{if(!store.checkPin(pin.getText().toString())){int n=store.prefs.getInt("pinFails",0)+1;store.prefs.edit().putInt("pinFails",n%5).putLong("pinWait",n>=5?System.currentTimeMillis()+60000:0).apply();Toast.makeText(this,"PIN incorreto.",Toast.LENGTH_SHORT).show();askingPin=false;d.dismiss();cancel.run();return;}store.prefs.edit().putInt("pinFails",0).putLong("pinWait",0).apply();authorizedUntil=System.currentTimeMillis()+300000;askingPin=false;d.dismiss();action.run();}));d.show();
    }
    public final class Bridge {
        @JavascriptInterface public void call(String id,String action,String raw){if(id==null||!id.matches("[0-9]{1,12}")||raw==null||raw.length()>65536)return;runOnUiThread(()->dispatch(id,action,raw));}
    }
    void dispatch(String id,String action,String raw){try{
        if(action.equals("snapshot")){result(id,snapshot(),null);return;}
        if(action.equals("update")){checkUpdate(true);result(id,new JSONObject(),null);return;}
        JSONObject body=new JSONObject(raw);
        if(action.equals("select")){if(!store.parent())throw new Exception("Apenas no aparelho do responsável.");gate(()->network(id,"/api/parent/sync",body),()->result(id,null,"Acesso cancelado."));return;}
        if(action.equals("sync")){if(busy)throw new Exception("Aguarde a operação atual.");busy=true;Remote.sync(this,error->runOnUiThread(()->{busy=false;try{result(id,snapshot(),error);}catch(Exception e){result(id,null,"Falha ao atualizar.");}}));return;}
        if(action.equals("/api/child/claim")){if(store.parent())throw new Exception("Conclua a tarefa pelo aparelho da criança.");network(id,action,body);return;}
        if(!PARENT_PATHS.contains(action))throw new Exception("Operação não permitida.");if(action.equals("/api/pair")&&!store.parent())throw new Exception("Adicione aparelhos no celular do responsável.");gate(()->network(id,action,body),()->result(id,null,"Acesso cancelado."));
    }catch(Exception e){result(id,null,e.getMessage());}}
    void network(String id,String path,JSONObject data){if(busy){result(id,null,"Aguarde a operação atual.");return;}busy=true;Remote.IO.execute(()->{try{JSONObject r=Remote.call(store,path,data);runOnUiThread(()->{busy=false;remember(r);result(id,r,null);});}catch(Exception e){runOnUiThread(()->{busy=false;result(id,null,e.getMessage());});}});}
}
