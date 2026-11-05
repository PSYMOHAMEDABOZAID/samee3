package app.samee3.quran;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.webkit.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.util.concurrent.*;
import org.json.*;

/** Original website design, restricted to the SAMEE3 origin, with a native offline fallback. */
public class WebActivity extends Activity {
    private AndroidBridge androidBridge;
    private LinearLayout controls;
    protected boolean originalDesign(){return false;}
    protected boolean television(){return false;}
    protected WebView web;private ProgressBar progress;private TextView message;
    private ValueCallback<Uri[]> files;private GeolocationPermissions.Callback location;private String locationOrigin;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private WebMessagePort downloadPort;
    private OutputStream exportOutput;private File exportPart,exportFile;
    private long expectedBytes,receivedBytes;private int expectedSequence;private String exportMime;
    static boolean trusted(Uri uri){return "https".equals(uri.getScheme())&&"samee3.vercel.app".equalsIgnoreCase(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443)&&uri.getUserInfo()==null;}
    @Override public void onCreate(Bundle saved){super.onCreate(saved);if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(true);LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setFitsSystemWindows(true);root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        LinearLayout row=new LinearLayout(this);controls=row;if(originalDesign())row.setOrientation(LinearLayout.VERTICAL);Button back=new Button(this);back.setText("رجوع");back.setOnClickListener(v->onBackPressed());row.addView(back);Button reload=new Button(this);reload.setText("إعادة تحميل");reload.setOnClickListener(v->{message.setVisibility(View.GONE);web.reload();});row.addView(reload);Button outside=new Button(this);outside.setText("المتصفح");outside.setOnClickListener(v->{String url=web.getUrl();if(url!=null&&trusted(Uri.parse(url)))openOutside(Uri.parse(url));});row.addView(outside);Button offline=new Button(this);offline.setText("المصحف المحفوظ");offline.setOnClickListener(v->startActivity(new Intent(this,MainActivity.class)));row.addView(offline);root.addView(row);if(originalDesign())row.setVisibility(View.GONE);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);root.addView(progress,new LinearLayout.LayoutParams(-1,6));message=new TextView(this);message.setPadding(16,16,16,16);message.setTextColor(0xff9c3f24);message.setVisibility(View.GONE);root.addView(message);
        try{web=new WebView(this);}catch(Exception e){message.setText("عرض أقسام الموقع يحتاج Android System WebView مفعّلًا ومحدّثًا. المصحف المحلي متاح في تبويب المصحف.");message.setVisibility(View.VISIBLE);reload.setEnabled(false);outside.setOnClickListener(v->openOutside(Uri.parse("https://samee3.vercel.app/")));setContentView(root);return;}root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setDatabaseEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(false);settings.setGeolocationEnabled(true);settings.setSupportMultipleWindows(false);settings.setUserAgentString(settings.getUserAgentString()+" SAMEE3Android/1.1");CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);CookieManager.getInstance().setCookie("https://samee3.vercel.app","samee3_compat=; Max-Age=0; Path=/; Secure");settings.setCacheMode(WebSettings.LOAD_DEFAULT);androidBridge=new AndroidBridge(this);ReminderReceiver.channels(this);ReminderScheduler.reschedule(this);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if(trusted(uri))return false;if("about".equals(uri.getScheme())&&"about:blank".equals(uri.toString()))return false;if(!request.isForMainFrame())return !"https".equals(uri.getScheme());openOutside(uri);return true;}
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();failure("تعذر التحقق من أمان الاتصال. لم يتم تجاوز شهادة الموقع.");}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())failure("تعذر تحميل هذا القسم. تحقق من الاتصال؛ يمكنك قراءة المصحف المحفوظ من تبويب المصحف.");}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)failure("المصدر غير متاح حاليًا. أعد المحاولة.");}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){closeDownloadPort();if(androidBridge!=null)androidBridge.close();}
            @Override public void onPageFinished(WebView view,String url){if(!trusted(Uri.parse(url)))return;CookieManager.getInstance().flush();if(television())view.evaluateJavascript("document.documentElement.classList.add('samee3-tv');localStorage.setItem('samee3_tv_mode','1');var m=document.querySelector('meta[name=viewport]');if(m)m.content='width=1280, initial-scale=1';",null);prepareDownloadPort();if(androidBridge!=null)androidBridge.attach(view);}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);progress.setVisibility(value==100?View.GONE:View.VISIBLE);}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(files!=null)files.onReceiveValue(null);files=callback;try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");String[] types=params.getAcceptTypes();if(types.length>0)intent.putExtra(Intent.EXTRA_MIME_TYPES,types);startActivityForResult(intent,71);return true;}catch(Exception e){files=null;callback.onReceiveValue(null);return true;}}
            @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){if(!trusted(Uri.parse(origin))){callback.invoke(origin,false,false);return;}location=callback;locationOrigin=origin;if(checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED){callback.invoke(origin,true,false);location=null;}else requestPermissions(new String[]{android.Manifest.permission.ACCESS_COARSE_LOCATION,android.Manifest.permission.ACCESS_FINE_LOCATION},72);}
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
        });
        web.setDownloadListener((url,agent,disposition,type,length)->{
            if(url.startsWith("blob:")){failure("استخدم زر التنزيل داخل الصفحة، أو افتح المحرر في المتصفح.");return;}
            Uri uri=Uri.parse(url);if(!"https".equals(uri.getScheme()))return;openOutside(uri);
        });
        if(television()){settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);settings.setTextZoom(100);settings.setUserAgentString(settings.getUserAgentString().replace(" Mobile "," ")+" SAMEE3TV/2.0");web.setInitialScale(0);}
        openPath(getIntent().getStringExtra("path"));
    }
    private void failure(String text){message.setText(text);message.setVisibility(View.VISIBLE);if(controls!=null)controls.setVisibility(View.VISIBLE);}
    private void openOutside(Uri uri){String scheme=uri.getScheme();if(!"https".equals(scheme)&&!"mailto".equals(scheme)&&!"tel".equals(scheme))return;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception e){failure("لم يتوفر تطبيق لفتح هذا الرابط.");}}
    // A message port is transferred only to the trusted TOP-LEVEL origin.
    // No addJavascriptInterface is exposed to third-party frames.
    private void prepareDownloadPort(){
        closeDownloadPort();String token=java.util.UUID.randomUUID().toString();
        WebMessagePort[] ports=web.createWebMessageChannel();downloadPort=ports[0];
        downloadPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort port,WebMessage message){String value=message.getData();if(value==null||value.length()>500000)return;io.execute(()->receiveExport(port,value));}});
        String script="(function(token){if(window.__samee3ExportCleanup)window.__samee3ExportCleanup();var port=null,waiting=null,timer=null,busy=false;"
            +"function send(data){return new Promise(function(ok,no){waiting={ok:ok,no:no};timer=setTimeout(function(){waiting=null;no(Error('timeout'))},20000);port.postMessage(JSON.stringify(data))})}"
            +"function read(blob){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(String(r.result).split(',')[1])};r.onerror=no;r.readAsDataURL(blob)})}"
            +"function connect(e){if(e.data!==token||!e.ports||!e.ports[0])return;port=e.ports[0];port.onmessage=function(e){var w=waiting;waiting=null;clearTimeout(timer);if(!w)return;var r=JSON.parse(e.data);r.ok?w.ok():w.no(Error('save'))};port.start();window.Samee3FileWriter={create:async function(name){if(busy)throw Error('busy');busy=true;var seq=0,total=0;try{await send({type:'start',name:name,mime:'application/zip',size:0})}catch(err){busy=false;throw err}return {write:async function(bytes){for(var at=0;at<bytes.length;at+=196608){var part=bytes.subarray(at,at+196608),binary='';for(var j=0;j<part.length;j++)binary+=String.fromCharCode(part[j]);await send({type:'chunk',seq:seq++,data:btoa(binary)});total+=part.length}},close:async function(){try{await send({type:'end',size:total})}finally{busy=false}},abort:async function(){try{await send({type:'abort'})}finally{busy=false}}}}}}"
            +"async function click(e){var a=e.target.closest&&e.target.closest('a[download]');if(!a||!a.href||a.href.indexOf('blob:https://samee3.vercel.app/')!==0||!port)return;e.preventDefault();if(busy)return;busy=true;try{var b=await(await fetch(a.href)).blob();if(!b.size||b.size>128*1024*1024)throw Error('size');await send({type:'start',name:a.download||'samee3-file',mime:b.type,size:b.size});var seq=0;for(var at=0;at<b.size;at+=262144)await send({type:'chunk',seq:seq++,data:await read(b.slice(at,at+262144))});await send({type:'end'})}catch(err){alert('تعذر حفظ الملف. افتح المحرر في المتصفح وأعد التنزيل.')}finally{busy=false}}"
            +"window.addEventListener('message',connect);document.addEventListener('click',click,true);window.__samee3ExportCleanup=function(){window.removeEventListener('message',connect);document.removeEventListener('click',click,true);if(port)port.close();delete window.Samee3FileWriter;clearTimeout(timer)}})("+JSONObject.quote(token)+");";
        web.evaluateJavascript(script,value->{if(web!=null&&!isDestroyed()&&web.getUrl()!=null&&trusted(Uri.parse(web.getUrl())))web.postWebMessage(new WebMessage(token,new WebMessagePort[]{ports[1]}),Uri.parse("https://samee3.vercel.app"));});
    }
    private void receiveExport(WebMessagePort port,String value){
        try{JSONObject item=new JSONObject(value);String type=item.getString("type");
            if(type.equals("start")){
                abortExport();exportMime=item.getString("mime");expectedBytes=item.getLong("size");receivedBytes=0;expectedSequence=0;
                if(expectedBytes<0||expectedBytes>128L*1024*1024||(expectedBytes==0&&!"application/zip".equals(exportMime))||!java.util.Arrays.asList("video/mp4","video/webm","image/png","image/jpeg","application/pdf","audio/mpeg","application/zip").contains(exportMime))throw new IOException();
                String safe=item.optString("name","samee3-file").replaceAll("[^\\p{L}\\p{N}._-]","_");safe=safe.substring(0,Math.min(100,safe.length()));if(safe.isEmpty())safe="samee3-file";
                File folder=new File(getFilesDir(),"exports");folder.mkdirs();exportFile=new File(folder,System.currentTimeMillis()+"-"+safe);exportPart=new File(exportFile.getPath()+".part");exportOutput=new FileOutputStream(exportPart);
            }else if(type.equals("chunk")){
                if(exportOutput==null||item.getInt("seq")!=expectedSequence++)throw new IOException();byte[] bytes=android.util.Base64.decode(item.getString("data"),android.util.Base64.DEFAULT);if(bytes.length>262144||receivedBytes+bytes.length>(expectedBytes>0?expectedBytes:8L*1024*1024*1024))throw new IOException();exportOutput.write(bytes);receivedBytes+=bytes.length;
            }else if(type.equals("end")){
                if(exportOutput==null||(expectedBytes>0?receivedBytes!=expectedBytes:item.optLong("size",-1)!=receivedBytes))throw new IOException();exportOutput.close();exportOutput=null;if(!exportPart.renameTo(exportFile))throw new IOException();File completed=exportFile;String mime=exportMime;exportPart=null;exportFile=null;runOnUiThread(()->{if(!isDestroyed())AppFileProvider.share(this,completed,mime);});
            }else if(type.equals("abort")){abortExport();}else throw new IOException();
            runOnUiThread(()->{try{port.postMessage(new WebMessage("{\"ok\":true}"));}catch(Exception ignored){}});
        }catch(Exception e){abortExport();runOnUiThread(()->{try{port.postMessage(new WebMessage("{\"ok\":false}"));}catch(Exception ignored){}if(!isDestroyed())failure("لم يكتمل حفظ الملف.");});}
    }
    private void abortExport(){try{if(exportOutput!=null)exportOutput.close();}catch(Exception ignored){}exportOutput=null;if(exportPart!=null)exportPart.delete();exportPart=null;exportFile=null;}
    private void closeDownloadPort(){if(downloadPort!=null){downloadPort.close();downloadPort=null;}if(!io.isShutdown())io.execute(this::abortExport);}
    @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==71&&files!=null){files.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);files=null;}}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(androidBridge!=null)androidBridge.permissionResult(code);if(code==72&&location!=null){boolean granted=false;for(int value:results)granted|=value==PackageManager.PERMISSION_GRANTED;location.invoke(locationOrigin,granted,false);location=null;}}
    protected void openPath(String path){if(web==null)return;if(path==null||!path.startsWith("/")||path.startsWith("//")||path.contains("\\")||path.indexOf('\n')>=0||path.indexOf('\r')>=0)path=television()?"/?tv=1":"/";web.loadUrl("https://samee3.vercel.app"+path);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);openPath(intent.getStringExtra("path"));}
    @Override protected void onResume(){super.onResume();ReminderScheduler.reschedule(this);}
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else finish();}
    @Override protected void onDestroy(){if(files!=null)files.onReceiveValue(null);if(location!=null)location.invoke(locationOrigin,false,false);closeDownloadPort();if(androidBridge!=null)androidBridge.close();if(web!=null){web.stopLoading();web.destroy();}io.shutdown();super.onDestroy();}
}
