package app.samee3.quran;

import android.app.*;
import android.content.*;
import android.os.Build;
import org.json.*;
import java.util.Arrays;

/** Alarm receiver is private; notification taps always open a validated app route. */
public final class ReminderReceiver extends BroadcastReceiver {
    public static final String GENERAL_CHANNEL = "samee3-reminders-v1";
    public static final String PRAYER_CHANNEL = "samee3-prayer-v1";
    private static final String FULL_CHANNEL = "samee3-prayer-full-v1";

    @Override public void onReceive(Context context, Intent intent) {
        if (!ReminderScheduler.ACTION.equals(intent.getAction())) return;
        String key = intent.getStringExtra("key");
        if (!Arrays.asList(ReminderScheduler.KEYS).contains(key)) return;
        long due = intent.getLongExtra("at", -1), now = System.currentTimeMillis();
        long expected = ReminderSettings.prefs(context).getLong("next:" + key, -2);
        boolean prayer = Arrays.asList(ReminderSettings.PRAYERS).contains(key);
        if (due != expected) return; // An alarm from a previous preference/location must not fire.
        if (ReminderScheduler.allowed(context) && ReminderScheduler.enabled(ReminderSettings.read(context), key)
                && now >= due && now - due < (prayer ? 5 : 30) * 60_000L) {
            boolean fullAdhan = prayer && ReminderSettings.read(context).optBoolean("fullAdhan", true)
                    && intent.getBooleanExtra("exact", false) && ReminderScheduler.exactAllowed(context);
            show(context, key, false, fullAdhan);
            if (fullAdhan && !AdhanService.start(context, key)) show(context, key, false, false);
        }
        ReminderScheduler.schedule(context, key, now);
    }

    public static void channels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel general = new NotificationChannel(GENERAL_CHANNEL, "الورد والأذكار والأحاديث", NotificationManager.IMPORTANCE_DEFAULT);
        general.setDescription("تذكيرات تختار مواعيدها من إعدادات سميع");
        NotificationChannel prayer = new NotificationChannel(PRAYER_CHANNEL, "تنبيهات مواقيت الصلاة", NotificationManager.IMPORTANCE_HIGH);
        prayer.setDescription("تنبيه عند دخول وقت الصلاة؛ الصوت قابل للتغيير من إعدادات الهاتف");
        prayer.enableVibration(true);
        NotificationChannel full = new NotificationChannel(FULL_CHANNEL, "موعد الصلاة مع الأذان الكامل", NotificationManager.IMPORTANCE_HIGH);
        full.setSound(null, null); full.enableVibration(true);
        full.setDescription("الأذان المختار يعمل من مشغل سميع، ويمكن إيقافه من الإشعار");
        manager.createNotificationChannels(Arrays.asList(general, prayer, full));
    }

    public static void show(Context context, String key, boolean test) { show(context, key, test, false); }
    private static void show(Context context, String key, boolean test, boolean fullAdhan) {
        if (!ReminderScheduler.allowed(context)) return;
        channels(context);
        boolean prayer = Arrays.asList(ReminderSettings.PRAYERS).contains(key);
        String title = "مصحف سميع", body = "حان موعد وردك من القرآن الكريم. افتح المصحف وتابع قراءتك.", path = "/mushaf";
        if (key.equals("quran")) {
            String[] names = {"الفاتحة", "الفاتحة", "الفاتحة", "الإخلاص", "الإخلاص", "الفلق", "الناس"};
            String[] excerpt = {"بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", "قُلْ هُوَ اللَّهُ أَحَدٌ", "اللَّهُ الصَّمَدُ", "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ", "قُلْ أَعُوذُ بِرَبِّ النَّاسِ"};
            String[] refs = {"1:1", "1:2", "1:5", "112:1", "112:2", "113:1", "114:1"};
            int day = (int) Math.floorDiv(System.currentTimeMillis(), 86400000L);
            int index = Math.floorMod(day, refs.length);
            title = "آية من سورة " + names[index];
            body = excerpt[index];
            path = "/mushaf?page=" + (index < 3 ? "1" : "604") + "&ayah=" + refs[index] + "&riwaya=hafs";
        }
        if (key.equals("morning") || key.equals("evening")) {
            title = key.equals("morning") ? "أذكار الصباح" : "أذكار المساء";
            body = "اذكر الله وابدأ " + (key.equals("morning") ? "يومك" : "مساءك") + " بطمأنينة. اضغط لقراءة الأذكار.";
            path = key.equals("morning") ? "/adhkar/read?type=morning" : "/adhkar/read?type=evening";
        }
        if (key.equals("hadith")) {
            title = "حديث تقرؤه اليوم";
            try {
                String source;
                try (java.io.InputStream input = context.getAssets().open("reminders.json")) { java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream(); byte[] bytes = new byte[4096]; int n; while ((n = input.read(bytes)) != -1) output.write(bytes, 0, n); source = output.toString("UTF-8"); }
                JSONArray hadiths = new JSONObject(source).getJSONArray("hadiths");
                int index = ReminderSettings.prefs(context).getInt("hadithIndex", 0);
                JSONObject hadith = hadiths.getJSONObject(Math.floorMod(index, hadiths.length()));
                body = hadith.getString("text") + "\n" + hadith.getString("reference");
                path = "/notifications/hadith?id=" + hadith.getString("id");
                if (!test) ReminderSettings.prefs(context).edit().putInt("hadithIndex", index == Integer.MAX_VALUE ? 0 : index + 1).apply();
            } catch (Exception ignored) { body = "دقائق مع سنة النبي ﷺ. افتح مكتبة الحديث واقرأ حديثًا."; path = "/hadith"; }
        }
        if (key.equals("audio")) { title = "وقت الاستماع للقرآن"; body = "اختر قارئك واستمع إلى تلاوة من القرآن الكريم."; path = "/audio"; }
        if (key.equals("library")) { title = "موعد القراءة والتعلّم"; body = "خصص دقائق لكتاب أو درس من المكتبة الشرعية."; path = "/islamic-library"; }
        if (prayer) {
            String name = ReminderSettings.PRAYER_NAMES[Arrays.asList(ReminderSettings.PRAYERS).indexOf(key)];
            title = "حان وقت صلاة " + name;
            body = "بحسب مواقيت " + ReminderSettings.read(context).optString("city") + ". اضغط لفتح مواقيت الصلاة.";
            path = "/prayer";
        }
        int id = test ? 499 : 400 + Arrays.asList(ReminderScheduler.KEYS).indexOf(key);
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        Intent open = (launch == null ? new Intent(context, AndroidActivity.class) : launch).setAction(Intent.ACTION_VIEW)
                .setData(android.net.Uri.parse("samee3://open/" + id)).putExtra("path", path)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(context, prayer ? (fullAdhan ? FULL_CHANNEL : PRAYER_CHANNEL) : GENERAL_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification).setColor(0xff194f43).setContentTitle(test ? "اختبار — " + title : title)
                .setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(false)
                .setCategory(prayer ? Notification.CATEGORY_REMINDER : Notification.CATEGORY_RECOMMENDATION)
                .setVisibility(Notification.VISIBILITY_PUBLIC).setShowWhen(true);
        if (prayer && ReminderSettings.read(context).optBoolean("fullAdhan", true)) {
            PendingIntent play = PendingIntent.getForegroundService(context, id + 1000,
                    new Intent(context, AdhanService.class).setAction(AdhanService.PLAY).putExtra("prayer", key), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(new Notification.Action.Builder(null, "تشغيل الأذان", play).build());
        }
        Notification notification = builder.build();
        try { context.getSystemService(NotificationManager.class).notify(id, notification); } catch (SecurityException ignored) {}
    }
}
