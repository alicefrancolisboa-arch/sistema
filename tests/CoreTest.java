import br.com.tempodecrescer.Policy;
import br.com.tempodecrescer.UsageReducer;
public class CoreTest {
    static int checks;
    static void check(boolean b){checks++;if(!b)throw new AssertionError("Check "+checks);}
    public static void main(String[] args){
        check(Policy.resting(1260,1260,420));check(Policy.resting(0,1260,420));check(!Policy.resting(420,1260,420));check(!Policy.resting(720,1260,420));
        check(Policy.resting(720,600,800));check(!Policy.resting(800,600,800));check(!Policy.resting(1,0,0));
        check(Policy.reason(true,true,120*60000L,120,false,0,0,0).length()>0);
        check(Policy.reason(true,true,120*60000L,135,false,0,0,0).isEmpty());
        check(Policy.reason(true,true,0,135,true,1260,1260,420).contains("descansar"));
        check(Policy.reason(false,true,999999999,1,true,1260,1260,420).isEmpty());
        check(Policy.reason(true,false,999999999,1,true,1260,1260,420).isEmpty());
        check(Policy.released(999,1000,true,"app",new String[]{}));
        check(!Policy.released(1000,1000,true,"app",new String[]{}));
        check(Policy.released(999999,0,true,"app",new String[]{}));
        check(Policy.released(1,0,false,"game",new String[]{"game","learn"}));
        check(!Policy.released(1,0,false,"video",new String[]{"game","learn"}));
        check(!Policy.released(1,-1,true,"game",new String[]{}));
        UsageReducer r=new UsageReducer(1000);r.event("a",1,500);r.event("a",2,1500);check(r.finish(2000).get("a")==500L);
        r=new UsageReducer(1000);r.event("a",1,1000);r.event("b",1,1500);r.event("a",2,1510);check(r.finish(2000).get("b")==500L);
        r=new UsageReducer(1000);r.event("a",1,1000);r.event("",15,1300);check(r.finish(2000).get("a")==300L);
        r=new UsageReducer(1000);r.event("a",1,1000);r.event("a",1,1200);check(r.finish(2000).get("a")==1000L);
        System.out.println(checks+" verificações de limite, bônus, descanso e uso passaram.");
    }
}
