package br.com.tempodecrescer;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.*;
import android.widget.*;
import android.os.*;
import android.app.KeyguardManager;
import android.content.*;
import android.graphics.Color;

public class GuardService extends AccessibilityService {
    Handler handler=new Handler();String active="";View overlay; long lastSync;boolean syncing;static volatile String foreground="";static volatile long observedAt;static volatile boolean foregroundBlocked;
    Runnable tick=new Runnable(){public void run(){check();handler.postDelayed(this,2000);}};
    @Override public void onServiceConnected(){handler.post(tick);}
    @Override public void onAccessibilityEvent(AccessibilityEvent e){if(e.getEventType()==AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && e.getPackageName()!=null){String p=e.getPackageName().toString();if(!p.equals(getPackageName()))active=p;else if(overlay==null)active=p;check();}}
    void check(){Store s=new Store(this);if(s.parent()){hide();return;}
        long used=s.used(s.usage());boolean visible=((PowerManager)getSystemService(POWER_SERVICE)).isInteractive()&&!((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isKeyguardLocked();foreground=visible?active:"";observedAt=System.currentTimeMillis();foregroundBlocked=visible&&!s.reason(active,used).isEmpty();
        if(s.paired()&&!syncing&&System.currentTimeMillis()-lastSync>15000){syncing=true;lastSync=System.currentTimeMillis();Remote.sync(this,error->handler.post(()->syncing=false));}
        boolean locked=((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isKeyguardLocked(); boolean awake=((PowerManager)getSystemService(POWER_SERVICE)).isInteractive();
        String reason=s.reason(active,s.used(s.usage()));if(reason.isEmpty()||locked||!awake){hide();return;}
        if(overlay!=null)return;
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);box.setPadding(40,60,40,60);box.setBackgroundColor(Color.rgb(245,248,245));
        TextView title=new TextView(this);title.setText(reason);title.setTextColor(Color.rgb(8,100,90));title.setTextSize(30);title.setGravity(Gravity.CENTER);box.addView(title);
        TextView desc=new TextView(this);desc.setText("Uma pausa para brincar, aprender e descansar.\n\nVocê pode conferir suas tarefas e pedir a aprovação de um bônus.");desc.setTextSize(18);desc.setGravity(Gravity.CENTER);desc.setPadding(0,30,0,30);box.addView(desc);
        Button tasks=new Button(this);tasks.setText("Ver minhas tarefas");tasks.setOnClickListener(v->{hide();active=getPackageName();startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("tasks",true));});box.addView(tasks);
        Button home=new Button(this);home.setText("Voltar ao início");home.setOnClickListener(v->{performGlobalAction(GLOBAL_ACTION_HOME);hide();active="";});box.addView(home);
        WindowManager.LayoutParams p=new WindowManager.LayoutParams(-1,-1,WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,android.graphics.PixelFormat.OPAQUE);
        try{((WindowManager)getSystemService(WINDOW_SERVICE)).addView(box,p);overlay=box;}catch(Exception ignored){}
    }
    void hide(){if(overlay!=null){try{((WindowManager)getSystemService(WINDOW_SERVICE)).removeView(overlay);}catch(Exception ignored){}overlay=null;}}
    @Override public void onInterrupt(){hide();}
    @Override public void onDestroy(){foreground="";observedAt=0;handler.removeCallbacksAndMessages(null);hide();super.onDestroy();}
}
