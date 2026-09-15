package br.com.concursosaltinho

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val frame = FrameLayout(this)
        val loading = ProgressBar(this).apply { isIndeterminate = true }
        frame.addView(loading, FrameLayout.LayoutParams(110, 110, android.view.Gravity.CENTER))
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            setBackgroundColor(Color.WHITE)
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) { loading.visibility = android.view.View.GONE }
            }
            webChromeClient = WebChromeClient()
            loadUrl(BuildConfig.APP_URL)
        }
        frame.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(frame)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (webView.canGoBack()) webView.goBack() else finish() }
        })
    }
    override fun onDestroy() { webView.destroy(); super.onDestroy() }
}
