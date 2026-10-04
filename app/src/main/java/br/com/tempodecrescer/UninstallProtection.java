package br.com.tempodecrescer;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;

public final class UninstallProtection {
    private final Context context;
    private final DevicePolicyManager policy;
    private final ComponentName admin;
    public UninstallProtection(Context context){this.context=context;policy=(DevicePolicyManager)context.getSystemService(Context.DEVICE_POLICY_SERVICE);admin=new ComponentName(context,FamilyAdminReceiver.class);}
    public boolean managed(){return policy!=null&&policy.isDeviceOwnerApp(context.getPackageName());}
    public String status(){return managed()?"Protegido: aparelho gerenciado pelo Tempo de Crescer.":"Não protegido contra desinstalação: falta configurar o aparelho como gerenciado.";}
    public void protect(){if(!managed())throw new IllegalStateException("É necessário configurar o aparelho como gerenciado primeiro.");policy.setUninstallBlocked(admin,context.getPackageName(),true);if(!policy.isUninstallBlocked(admin,context.getPackageName()))throw new IllegalStateException("O Android ainda não confirmou a proteção.");}
    /** Only called after fresh parental PIN and explicit local confirmation. No data wipe. */
    @SuppressWarnings("deprecation") public void release(){
        if(!managed())throw new IllegalStateException("Este app não gerencia o aparelho.");
        policy.setUninstallBlocked(admin,context.getPackageName(),false);
        // Android offers no reversible temporary uninstall of the device owner itself.
        // This app sets no other owner policies; remove its ownership without erasing data.
        try{policy.clearDeviceOwnerApp(context.getPackageName());}catch(RuntimeException error){if(managed())policy.setUninstallBlocked(admin,context.getPackageName(),true);throw error;}
        if(managed())throw new IllegalStateException("O Android não autorizou encerrar o gerenciamento. A proteção continua ativa.");
        if(policy.isAdminActive(admin))policy.removeActiveAdmin(admin);
    }
}
