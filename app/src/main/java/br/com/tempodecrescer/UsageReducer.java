package br.com.tempodecrescer;

import java.util.*;

public final class UsageReducer {
    public interface Counter {long count(String pkg,long from,long to);}
    private final Counter counter;
    public final Map<String, Long> totals = new HashMap<>();
    private String active = "";
    private long since;
    private final long start;
    public UsageReducer(long start) { this(start,(pkg,from,to)->Math.max(0,to-from)); }
    public UsageReducer(long start,Counter counter) { this.start = start; this.counter=counter; }
    private void close(long time) {
        if (!active.isEmpty()) totals.put(active, totals.getOrDefault(active, 0L) + counter.count(active,Math.max(start,since),time));
        active = "";
    }
    public void event(String pkg, int type, long time) {
        if (type == 1) { close(time); active = pkg == null ? "" : pkg; since = time; }
        else if ((type == 2 && active.equals(pkg)) || type == 15 || type == 26 || type == 18) close(time);
    }
    public Map<String, Long> finish(long now) { close(now); return totals; }
}
