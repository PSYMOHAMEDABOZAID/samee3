package app.samee3.quran;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.UUID;

/** Uses Android WebMessagePort — never exposes addJavascriptInterface to third-party frames. */
final class Samee3WidgetTransport {
    private final Activity activity;
    private WebMessagePort port;
    Samee3WidgetTransport(Activity activity) { this.activity = activity; }

    void close() {
        if (port != null) { try { port.close(); } catch (Exception ignored) {} port = null; }
    }

    void attach(WebView web) {
        close();
        String current = web.getUrl();
        if (current == null || !WebActivity.trusted(Uri.parse(current))) return;
        String token = UUID.randomUUID().toString();
        WebMessagePort[] ports = web.createWebMessageChannel();
        port = ports[0];
        port.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override public void onMessage(WebMessagePort source, WebMessage message) {
                String payload = message.getData();
                if (payload == null || payload.length() > 48000) return;
                try {
                    JSONObject json = new JSONObject(payload);
                    if (json.optInt("version") != 1 || json.optJSONArray("widgets") == null) return;
                    activity.getSharedPreferences("samee3_widget_data", Context.MODE_PRIVATE)
                        .edit().putString("snapshot", payload).apply();
                    Samee3Widgets.refreshAll(activity);
                } catch (Exception ignored) { /* malformed or oversized snapshot */ }
            }
        });
        // The random one-use token and exact target origin deliver the port to the top-level trusted frame.
        String script = "(function(token){"
            + "if(window.__samee3WidgetsCleanup)window.__samee3WidgetsCleanup();"
            + "var port=null;function connect(e){if(e.data!==token||!e.ports||!e.ports[0])return;"
            + "window.removeEventListener('message',connect);port=e.ports[0];port.start();"
            + "window.Samee3WidgetsTransport={send:function(data){if(port&&typeof data==='string'&&data.length<48000)port.postMessage(data)}};"
            + "window.dispatchEvent(new Event('samee3:widget-settings'));}"
            + "window.addEventListener('message',connect);"
            + "window.__samee3WidgetsCleanup=function(){window.removeEventListener('message',connect);if(port)port.close();delete window.Samee3WidgetsTransport};"
            + "})(" + JSONObject.quote(token) + ");";
        web.evaluateJavascript(script, result -> {
            if (port != null && !activity.isDestroyed() && web.getUrl() != null && WebActivity.trusted(Uri.parse(web.getUrl()))) {
                web.postWebMessage(new WebMessage(token, new WebMessagePort[]{ports[1]}), Uri.parse("https://samee3.vercel.app"));
            }
        });
    }
}
