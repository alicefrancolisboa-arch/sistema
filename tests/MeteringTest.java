import br.com.tempodecrescer.*;
import java.util.*;
public class MeteringTest {
 static int checks;
 static Metering.Rule rule(long at,Set<String> apps,Set<String> free,long until){return new Metering.Rule(at,apps,true,false,false,free,until);}
 static void eq(long actual,long expected){checks++;if(actual!=expected)throw new AssertionError("Check "+checks+": "+actual+" != "+expected);}
 public static void main(String[] args){
  Set<String> games=Set.of("game"),both=Set.of("game","whatsapp"),none=Set.of();
  Metering m=new Metering(List.of(rule(0,games,none,-1)));
  eq(m.count("whatsapp",0,30*60000),0);eq(60*60000-m.count("whatsapp",0,30*60000),60*60000);
  m=new Metering(List.of(rule(0,both,none,-1),rule(10,games,none,-1),rule(40,both,none,-1)));
  eq(m.count("whatsapp",0,50),20);eq(m.count("game",0,50),50);
  List<Metering.Rule> history=List.of(rule(0,both,none,-1),rule(10,both,Set.of("whatsapp"),30));
  m=new Metering(history);eq(m.count("whatsapp",0,40),20);eq(m.count("game",0,40),40);
  eq(new Metering(history).count("whatsapp",0,40),20);
  UsageReducer reducer=new UsageReducer(15,m);reducer.event("whatsapp",1,0);eq(reducer.finish(40).get("whatsapp"),10);
  m=new Metering(List.of(rule(0,both,none,-1),rule(10,both,Set.of("whatsapp"),30),rule(20,both,none,-1)));
  eq(m.count("whatsapp",0,40),30);
  m=new Metering(List.of(rule(0,both,Set.of("whatsapp"),0)));eq(m.count("whatsapp",0,100000),0);
  m=new Metering(List.of(new Metering.Rule(0,both,true,false,true,none,30)));eq(m.count("game",0,40),10);
  m=new Metering(List.of(new Metering.Rule(0,both,false,false,false,none,-1)));eq(m.count("game",0,40),0);
  m=new Metering(List.of(new Metering.Rule(0,both,true,true,false,none,-1)));eq(m.count("game",0,40),0);
  System.out.println(checks+" checks passed for free apps and historical metering.");
 }
}
