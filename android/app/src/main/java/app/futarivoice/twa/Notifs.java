package app.futarivoice.twa;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** おしらせ（通知）のおたすけ */
final class Notifs {
    static final String CH_CALL = "call", CH_MSG = "msg";

    private Notifs() {}

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel call = new NotificationChannel(CH_CALL, "通話中", NotificationManager.IMPORTANCE_LOW);
        call.setDescription("ボイスや個人通話につながっているあいだ、出しておくおしらせ");
        NotificationChannel msg = new NotificationChannel(CH_MSG, "メッセージと電話", NotificationManager.IMPORTANCE_HIGH);
        msg.setDescription("個人チャット・フレンド申請・電話がきたときのおしらせ");
        nm.createNotificationChannel(call);
        nm.createNotificationChannel(msg);
    }

    static PendingIntent open(Context c, String action, int req) {
        Intent i = new Intent(c, MainActivity.class);
        if (action != null) i.setAction(action);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressWarnings("deprecation")
    static Notification.Builder builder(Context c, String ch) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat).setColor(0xFF5865F2);
        return b;
    }

    @SuppressWarnings("deprecation")
    static void show(Context c, String title, String text, String tag) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification n = builder(c, CH_MSG)
                .setContentTitle(title == null ? "ふたりボイス" : title)
                .setContentText(text == null ? "" : text)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .setContentIntent(open(c, null, 1))
                .build();
        nm.notify(tag == null ? "msg" : tag, 2, n);
    }

    static void cancel(Context c, String tag) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(tag == null ? "msg" : tag, 2);
    }
}
