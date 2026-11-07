package app.samee3.quran;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** 16 independent home screen widget providers; no extra Android dependency. */
public final class Samee3Widgets {
    private Samee3Widgets() {}

    private static final Class<?>[] PROVIDERS = {
        Reading.class, Ayah.class, Surahs.class, Audio.class, Morning.class, Evening.class,
        Tasbih.class, Prayer.class, Hadith.class, Library.class, Tarbiyah.class, Visual.class,
        Favorites.class, Reminders.class, Messages.class, Profile.class
    };
    private static final String[] KINDS = {
        "reading", "ayah", "surahs", "audio", "morning", "evening", "tasbih", "prayer",
        "hadith", "library", "tarbiyah", "visual", "favorites", "reminders", "messages", "profile"
    };

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int i = 0; i < KINDS.length; i++) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, PROVIDERS[i]));
            if (ids.length > 0) render(context, manager, KINDS[i], ids);
        }
    }

    static void render(Context context, AppWidgetManager manager, String kind, int[] ids) {
        JSONObject snapshot;
        try {
            String data = context.getSharedPreferences("samee3_widget_data", Context.MODE_PRIVATE).getString("snapshot", "{}");
            snapshot = new JSONObject(data == null ? "{}" : data);
        } catch (Exception ignored) { snapshot = new JSONObject(); }
        JSONArray rows = snapshot.optJSONArray("widgets");
        JSONObject item = null;
        if (rows != null) for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && kind.equals(row.optString("id"))) { item = row; break; }
        }
        String theme = snapshot.optString("theme", "emerald");
        int background = Color.rgb(9, 61, 48);
        int foreground = Color.WHITE;
        if ("ivory".equals(theme)) { background = Color.rgb(248, 241, 225); foreground = Color.rgb(35, 70, 61); }
        else if ("midnight".equals(theme)) background = Color.rgb(12, 25, 46);
        else if ("sand".equals(theme)) background = Color.rgb(116, 84, 55);
        else if ("royal".equals(theme)) background = Color.rgb(25, 46, 97);
        else if ("rose".equals(theme)) background = Color.rgb(106, 59, 76);
        for (int id : ids) {
            RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.samee3_widget);
            view.setInt(R.id.samee3_widget_root, "setBackgroundColor", background);
            view.setTextViewText(R.id.samee3_widget_brand, "مصحف سميع");
            view.setTextViewText(R.id.samee3_widget_title, item == null ? "مصحف سميع" : item.optString("title", "مصحف سميع"));
            view.setTextViewText(R.id.samee3_widget_subtitle, item == null ? "افتح سميع لتحديث البيانات" : item.optString("subtitle", ""));
            view.setTextViewText(R.id.samee3_widget_detail, item == null ? "" : item.optString("detail", ""));
            view.setTextColor(R.id.samee3_widget_brand, foreground);
            view.setTextColor(R.id.samee3_widget_title, foreground);
            view.setTextColor(R.id.samee3_widget_subtitle, foreground);
            view.setTextColor(R.id.samee3_widget_detail, foreground);
            String proposed = item == null ? "/widgets" : item.optString("url", "/widgets");
            String route = proposed.startsWith("/") && !proposed.startsWith("//") && proposed.length() <= 500 && !proposed.contains("\\") && proposed.indexOf('\n') < 0 ? proposed : "/widgets";
            // Route inside the app, not the external browser. Existing WebActivity.openPath validates it.
            Intent open = new Intent(context, AndroidActivity.class).putExtra("path", route)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            view.setOnClickPendingIntent(R.id.samee3_widget_root, PendingIntent.getActivity(context, id, open, flags));
            manager.updateAppWidget(id, view);
        }
    }

    public abstract static class Base extends AppWidgetProvider {
        protected abstract String widgetKind();
        @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
            render(context, manager, widgetKind(), ids);
        }
    }
    public static final class Reading extends Base { protected String widgetKind() { return "reading"; } }
    public static final class Ayah extends Base { protected String widgetKind() { return "ayah"; } }
    public static final class Surahs extends Base { protected String widgetKind() { return "surahs"; } }
    public static final class Audio extends Base { protected String widgetKind() { return "audio"; } }
    public static final class Morning extends Base { protected String widgetKind() { return "morning"; } }
    public static final class Evening extends Base { protected String widgetKind() { return "evening"; } }
    public static final class Tasbih extends Base { protected String widgetKind() { return "tasbih"; } }
    public static final class Prayer extends Base { protected String widgetKind() { return "prayer"; } }
    public static final class Hadith extends Base { protected String widgetKind() { return "hadith"; } }
    public static final class Library extends Base { protected String widgetKind() { return "library"; } }
    public static final class Tarbiyah extends Base { protected String widgetKind() { return "tarbiyah"; } }
    public static final class Visual extends Base { protected String widgetKind() { return "visual"; } }
    public static final class Favorites extends Base { protected String widgetKind() { return "favorites"; } }
    public static final class Reminders extends Base { protected String widgetKind() { return "reminders"; } }
    public static final class Messages extends Base { protected String widgetKind() { return "messages"; } }
    public static final class Profile extends Base { protected String widgetKind() { return "profile"; } }
}
