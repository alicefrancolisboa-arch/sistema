package br.com.tempodecrescer;

public final class Policy {
    public static boolean released(long now,long until,boolean all,String pkg,String[] apps) {
        if(until<0 || (until>0&&now>=until))return false;
        if(all)return true;
        for(String app:apps)if(pkg.equals(app))return true;
        return false;
    }
    public static boolean resting(int minute, int start, int end) {
        if (start == end) return false;
        return start < end ? minute >= start && minute < end : minute >= start || minute < end;
    }
    public static String reason(boolean enabled, boolean selected, long used, int limit, boolean rest, int minute, int start, int end) {
        if (!enabled || !selected) return "";
        if (rest && resting(minute, start, end)) return "É hora de descansar";
        if (used >= limit * 60000L) return "Seu tempo de hoje terminou";
        return "";
    }
}
