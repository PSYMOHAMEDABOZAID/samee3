package app.samee3.quran;

import android.app.Activity;
import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

public final class AppFileProvider extends ContentProvider {
    public static void share(Activity activity,File file,String type){
        try{File root=activity.getFilesDir().getCanonicalFile(),target=file.getCanonicalFile();if(!target.getPath().startsWith(root.getPath()+File.separator)||!target.isFile())throw new IOException();String relative=root.toPath().relativize(target.toPath()).toString();Uri uri=new Uri.Builder().scheme("content").authority(activity.getPackageName()+".files").appendPath(relative).build();Intent share=new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);share.setClipData(ClipData.newRawUri(file.getName(),uri));activity.startActivity(Intent.createChooser(share,"مشاركة الملف"));}catch(Exception e){android.widget.Toast.makeText(activity,"تعذر فتح الملف للمشاركة.",android.widget.Toast.LENGTH_LONG).show();}
    }
    private File file(Uri uri)throws FileNotFoundException{try{File root=getContext().getFilesDir().getCanonicalFile();File target=new File(root,uri.getLastPathSegment()).getCanonicalFile();if(!target.getPath().startsWith(root.getPath()+File.separator)||!target.isFile())throw new IOException();return target;}catch(Exception e){throw new FileNotFoundException();}}
    @Override public boolean onCreate(){return true;}
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new FileNotFoundException("Read only");return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){try{File f=file(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor cursor=new MatrixCursor(columns);Object[] row=new Object[columns.length];for(int i=0;i<columns.length;i++)row[i]=columns[i].equals(OpenableColumns.DISPLAY_NAME)?f.getName():columns[i].equals(OpenableColumns.SIZE)?f.length():null;cursor.addRow(row);return cursor;}catch(Exception e){return null;}}
    @Override public String getType(Uri uri){String name=uri.getLastPathSegment();if(name==null)return "application/octet-stream";int dot=name.lastIndexOf('.');String type=dot<0?null:android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot+1).toLowerCase(java.util.Locale.ROOT));return type==null?"application/octet-stream":type;}
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String where,String[] args){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String where,String[] args){throw new UnsupportedOperationException();}
}
