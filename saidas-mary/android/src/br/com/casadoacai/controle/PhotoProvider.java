
package br.com.casadoacai.controle;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
public class PhotoProvider extends ContentProvider {
 public boolean onCreate(){return true;}
 private File file(Uri uri) throws FileNotFoundException {
  if(!"/capture.jpg".equals(uri.getPath()))throw new FileNotFoundException();
  return new File(getContext().getCacheDir(),"capture.jpg");
 }
 public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
  return ParcelFileDescriptor.open(file(uri), mode.contains("w")?ParcelFileDescriptor.MODE_CREATE|ParcelFileDescriptor.MODE_TRUNCATE|ParcelFileDescriptor.MODE_READ_WRITE:ParcelFileDescriptor.MODE_READ_ONLY);
 }
 public String getType(Uri uri){return "image/jpeg";}
 public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
  try{File f=file(uri);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{"folha-acai.jpg",f.length()});return c;}catch(Exception e){return null;}
 }
 public Uri insert(Uri uri,ContentValues v){throw new UnsupportedOperationException();}
 public int delete(Uri uri,String s,String[] a){throw new UnsupportedOperationException();}
 public int update(Uri uri,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}
