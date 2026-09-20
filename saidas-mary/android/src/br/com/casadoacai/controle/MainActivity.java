
package br.com.casadoacai.controle;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.File;
import java.net.URI;
public class MainActivity extends Activity {
 private WebView web;
 private LinearLayout layout;
 private ValueCallback<Uri[]> fileCallback;
 private Uri cameraUri;
 private String origin="";
 private static final int FILE_REQUEST=201,CAMERA_REQUEST=202;
 private static final int PLUM=Color.rgb(169,52,112);
 @Override public void onCreate(Bundle saved){super.onCreate(saved);origin=getPreferences(0).getString("server","");if(!getPreferences(0).getBoolean("cloudSetupV4",false)){origin="https://saidas-mary.onrender.com";getPreferences(0).edit().putString("server",origin).putBoolean("cloudSetupV4",true).apply();}if(origin.isEmpty())setup();else openApp();}
 private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
 private TextView text(String s,int size){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(PLUM);t.setPadding(0,dp(10),0,dp(10));return t;}
 private Button button(String s){Button b=new Button(this);b.setText(s);b.setAllCaps(false);return b;}
 private boolean sameOrigin(String value){
  try{URI a=new URI(origin),b=new URI(value);return a.getScheme().equalsIgnoreCase(b.getScheme())&&a.getHost().equalsIgnoreCase(b.getHost())&&a.getPort()==b.getPort();}catch(Exception e){return false;}
 }
 private String validate(String value) throws Exception {
  value=value.trim();if(!value.contains("://"))value="http://"+value;
  URI uri=new URI(value);String host=uri.getHost();
  if(host==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||(!uri.getPath().isEmpty()&&!uri.getPath().equals("/")))throw new Exception();
  boolean https="https".equalsIgnoreCase(uri.getScheme());
  boolean local=host.matches("10\\.[0-9.]+")||host.matches("192\\.168\\.[0-9.]+")||host.matches("172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9.]+")||host.equals("127.0.0.1")||host.equals("localhost");
  if(!https && !("http".equalsIgnoreCase(uri.getScheme())&&local))throw new Exception();
  return uri.getScheme().toLowerCase()+"://"+uri.getRawAuthority();
 }
 private void setup(){
  if(web!=null){web.destroy();web=null;}
  ScrollView scroll=new ScrollView(this);
  LinearLayout box=new LinearLayout(this);box.setOrientation(1);box.setPadding(dp(26),dp(34),dp(26),dp(24));scroll.addView(box);
  box.addView(text("Saídas Mary",32));box.addView(text("Seu controle, também no celular.",18));
  TextView help=text("Informe o endereço HTTPS do servidor Saídas Mary. Com o servidor online, você pode acessar pela internet sem deixar o computador ligado.",15);help.setTextColor(Color.DKGRAY);box.addView(help);
  box.addView(text("Endereço do Saídas Mary",14));
  EditText input=new EditText(this);input.setSingleLine(true);input.setInputType(17);input.setHint("https://seu-endereco.onrender.com");input.setText(origin);box.addView(input);
  TextView error=text("",14);error.setTextColor(Color.rgb(170,50,50));box.addView(error);
  Button connect=button("Conectar à minha loja");box.addView(connect);
  connect.setOnClickListener(v->{try{origin=validate(input.getText().toString());getPreferences(0).edit().putString("server",origin).putBoolean("cloudSetupV3",true).apply();CookieManager.getInstance().removeAllCookies(null);openApp();}catch(Exception e){error.setText("Use o endereço local do PC (http://192.168...) ou um endereço com HTTPS. Não inclua senha no endereço.");}});
  TextView info=text("A senha é informada na próxima tela. Clientes e vendas ficam no servidor escolhido. Use o endereço do Saídas Mary, separado do Aloha. A chave do Gemini não fica neste APK.",13);info.setTextColor(Color.GRAY);box.addView(info);
  setContentView(scroll);
 }
 private void openApp(){
  layout=new LinearLayout(this);layout.setOrientation(1);layout.setBackgroundColor(Color.rgb(255,247,251));
  LinearLayout bar=new LinearLayout(this);bar.setPadding(dp(10),dp(4),dp(10),dp(4));bar.setGravity(Gravity.CENTER_VERTICAL);
  TextView title=text("Saídas Mary",16);bar.addView(title,new LinearLayout.LayoutParams(0,dp(48),1));
  Button reload=button("↻");reload.setContentDescription("Recarregar");bar.addView(reload,new LinearLayout.LayoutParams(dp(52),dp(48)));
  Button config=button("⋮");config.setContentDescription("Configurar conexão");bar.addView(config,new LinearLayout.LayoutParams(dp(52),dp(48)));layout.addView(bar);
  web=new WebView(this);web.setBackgroundColor(Color.rgb(255,247,251));layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSafeBrowsingEnabled(true);
  CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  reload.setOnClickListener(v->web.reload());
  config.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Conexão com a loja").setMessage(origin).setPositiveButton("Trocar endereço",(d,w)->setup()).setNegativeButton("Fechar",null).show());
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    String url=request.getUrl().toString();if(sameOrigin(url))return false;
    String scheme=request.getUrl().getScheme();
    if("https".equals(scheme)||"whatsapp".equals(scheme)){
     try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(Exception e){Toast.makeText(MainActivity.this,"Não há aplicativo para abrir este link.",Toast.LENGTH_LONG).show();}
    }return true;
   }
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError err){
    if(request.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setTitle("Não consegui conectar ao computador").setMessage("Confira se o PC está ligado, se o servidor foi iniciado e se os dois aparelhos estão no mesmo Wi-Fi. Endereço: "+origin).setPositiveButton("Tentar novamente",(d,w)->web.loadUrl(origin)).setNeutralButton("Trocar endereço",(d,w)->setup()).setNegativeButton("Fechar",null).show();
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
    String[] accepts=params.getAcceptTypes();boolean json=false;for(String a:accepts)if(a.contains("json"))json=true;
    if(json){pickFile("application/json");return true;}
    if(params.isCaptureEnabled()){capture();return true;}
    new AlertDialog.Builder(MainActivity.this).setTitle("Foto da folha").setItems(new String[]{"Tirar foto","Escolher na galeria"},(d,which)->{if(which==0)capture();else pickFile("image/*");}).setOnCancelListener(d->finishFile(null)).show();
    return true;
   }
  });
  web.setDownloadListener((url,ua,disposition,mime,length)->{
   if(!sameOrigin(url))return;
   try{
    DownloadManager.Request r=new DownloadManager.Request(Uri.parse(url));r.addRequestHeader("Cookie",CookieManager.getInstance().getCookie(url));r.addRequestHeader("User-Agent",ua);
    r.setTitle("Backup Saídas Mary");r.setMimeType(mime);r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
    r.setDestinationInExternalFilesDir(this,Environment.DIRECTORY_DOWNLOADS,"acai-backup-"+System.currentTimeMillis()+".json");
    ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r);Toast.makeText(this,"Salvando cópia na pasta de downloads do aplicativo.",Toast.LENGTH_LONG).show();
   }catch(Exception e){Toast.makeText(this,"Não foi possível baixar. Faça a cópia pelo computador.",Toast.LENGTH_LONG).show();}
  });
  web.loadUrl(origin);
 }
 private void pickFile(String mime){try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(mime);startActivityForResult(intent,FILE_REQUEST);}catch(Exception e){finishFile(null);Toast.makeText(this,"Não foi possível abrir os arquivos.",Toast.LENGTH_LONG).show();}}
 private void capture(){
  try{
   File f=new File(getCacheDir(),"capture.jpg");if(f.exists())f.delete();
   cameraUri=Uri.parse("content://br.com.casadoacai.controle.photos/capture.jpg");
   Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);intent.putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("Foto da folha",cameraUri));startActivityForResult(intent,CAMERA_REQUEST);
  }catch(Exception e){finishFile(null);Toast.makeText(this,"Câmera indisponível. Escolha uma foto na galeria.",Toast.LENGTH_LONG).show();}
 }
 private void finishFile(Uri[] uris){if(fileCallback!=null){fileCallback.onReceiveValue(uris);fileCallback=null;}}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==FILE_REQUEST)finishFile(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);if(request==CAMERA_REQUEST)finishFile(result==RESULT_OK&&new File(getCacheDir(),"capture.jpg").length()>0?new Uri[]{cameraUri}:null);}
 @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){finishFile(null);if(web!=null)web.destroy();super.onDestroy();}
}
