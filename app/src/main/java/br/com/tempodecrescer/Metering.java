package br.com.tempodecrescer;

import java.util.*;

/** Charges event segments under the rules effective when they occurred. */
public final class Metering implements UsageReducer.Counter {
    public static final class Rule {
        public final long at,until; public final Set<String> apps,free; public final boolean enabled,blocked,all;
        public Rule(long at,Set<String> apps,boolean enabled,boolean blocked,boolean all,Set<String> free,long until){this.at=at;this.apps=apps;this.enabled=enabled;this.blocked=blocked;this.all=all;this.free=free;this.until=until;}
    }
    private final List<Rule> rules;
    public Metering(List<Rule> rules){this.rules=new ArrayList<>(rules);this.rules.sort(Comparator.comparingLong(r->r.at));}
    public long count(String pkg,long from,long to){long total=0;for(int i=0;i<rules.size();i++){Rule r=rules.get(i);long a=Math.max(from,r.at),b=Math.min(to,i+1<rules.size()?rules.get(i+1).at:to);if(b<=a||!r.enabled||r.blocked||!r.apps.contains(pkg))continue;if(r.until>=0&&(r.all||r.free.contains(pkg))){if(r.until==0)continue;a=Math.max(a,r.until);}total+=Math.max(0,b-a);}return total;}
}
