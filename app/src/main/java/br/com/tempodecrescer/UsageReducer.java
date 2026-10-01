package br.com.tempodecrescer;

import java.util.*;

public final class UsageReducer {
    public final Map<String, Long> totals = new HashMap<>();
    private String active = "";
    private long since;
    private final long start;
    public UsageReducer(long start) { this.start = start; }
    private void close(long time) {
        if (!active.isEmpty()) totals.put(active, totals.getOrDefault(active, 0L) + Math.max(0, time - Math.max(start, since)));
        active = "";
    }
    public void event(String pkg, int type, long time) {
        if (type == 1) { close(time); active = pkg == null ? "" : pkg; since = time; }
        else if ((type == 2 && active.equals(pkg)) || type == 15 || type == 26 || type == 18) close(time);
    }
    public Map<String, Long> finish(long now) { close(now); return totals; }
}
