import java.nio.file.*;
import java.security.*;
import java.io.*;
import java.util.*;
public class SignBundle {
 public static void main(String[] args)throws Exception {
  Properties p=new Properties();try(InputStream in=Files.newInputStream(Paths.get("signing.properties"))){p.load(in);}char[] pass=p.getProperty("password").toCharArray();KeyStore keys=KeyStore.getInstance("PKCS12");try(InputStream in=Files.newInputStream(Paths.get("tempo-de-crescer.jks"))){keys.load(in,pass);}Signature signature=Signature.getInstance("SHA256withRSA");signature.initSign((PrivateKey)keys.getKey("tempo-de-crescer",pass));signature.update(Files.readAllBytes(Paths.get(args[0])));Files.write(Paths.get(args[1]),Base64.getEncoder().encode(signature.sign()));Files.createDirectories(Paths.get("app/src/main/assets"));Files.write(Paths.get("app/src/main/assets/update-cert.der"),keys.getCertificate("tempo-de-crescer").getEncoded());
 }
}
