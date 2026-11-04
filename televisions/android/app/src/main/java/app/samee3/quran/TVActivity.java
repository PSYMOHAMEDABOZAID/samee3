package app.samee3.quran;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.app.AlertDialog;

/** Uses the same trusted-origin browser, Quran fallback and native reminders as the phone app. */
public class TVActivity extends WebActivity {
    @Override protected boolean originalDesign() { return true; }
    @Override protected boolean television() { return true; }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (web != null) web.requestFocus();
    }
    @Override public boolean onKeyDown(int code, KeyEvent event) {
        if (code == KeyEvent.KEYCODE_MENU) {
            new AlertDialog.Builder(this).setTitle("مصحف سميع للشاشات")
                .setItems(new String[]{"الرئيسية", "الإشعارات ومواقيت الصلاة", "إعادة تحميل الصفحة", "المصحف المحفوظ", "إغلاق النافذة"}, (dialog, position) -> {
                    if (position == 0) openPath("/?tv=1");
                    else if (position == 1) openPath("/notifications?tv=1");
                    else if (position == 2 && web != null) web.reload();
                    else if (position == 3) startActivity(new android.content.Intent(this, MainActivity.class));
                    else if (position == 4) finish();
                }).show();
            return true;
        }
        return super.onKeyDown(code, event);
    }
}
