package com.alohacasadoacai.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Cliente Android da Aloha. Todos os dados permanecem centralizados no servidor. */
public class MainActivity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> filePicker;
  private static final int PICK_NOTE = 501;
  private static final String APP_URL = "https://sistema-5huz.onrender.com";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(255,250,242));
    WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setAllowFileAccess(true);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if(filePicker!=null) filePicker.onReceiveValue(null); filePicker=callback;
        Intent choose=new Intent(Intent.ACTION_OPEN_DOCUMENT); choose.addCategory(Intent.CATEGORY_OPENABLE); choose.setType("image/*");
        startActivityForResult(Intent.createChooser(choose,"Selecionar foto da nota"), PICK_NOTE); return true;
      }
    });
    setContentView(web);
  }
  /** Reabre sempre a página publicada; atualizações do servidor não exigem outro APK. */
  @Override protected void onResume() { super.onResume(); if(web!=null) web.loadUrl(APP_URL); }
  @Override protected void onActivityResult(int request,int result,Intent data){ super.onActivityResult(request,result,data); if(request==PICK_NOTE && filePicker!=null){ Uri[] resultUris=(result==RESULT_OK && data!=null && data.getData()!=null)?new Uri[]{data.getData()}:null; filePicker.onReceiveValue(resultUris); filePicker=null; } }
  @Override public void onBackPressed(){ if(web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
