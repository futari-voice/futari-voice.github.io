package app.futarivoice.twa;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/** おしらせ（通知）のおたすけ */
final class Notifs {
    static final String CH_CALL = "call", CH_MSG = "msg", CH_WAIT = "wait", CH_RING = "ring";

    private Notifs() {}

    static void channels(Context c) {
        if (c == null || Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel call = new NotificationChannel(CH_CALL, "通話中", NotificationManager.IMPORTANCE_LOW);
        call.setDescription("ボイスや個人通話につながっているあいだ、出しておくおしらせ");
        NotificationChannel wait = new NotificationChannel(CH_WAIT, "メッセージを待っている", NotificationManager.IMPORTANCE_MIN);
        wait.setDescription("アプリをとじても、メッセージや電話を受け取るためのおしらせ");
        wait.setShowBadge(false);
        NotificationChannel msg = new NotificationChannel(CH_MSG, "メッセージ・フレンド申請", NotificationManager.IMPORTANCE_HIGH);
        msg.setDescription("個人チャット・サーバーのチャット・フレンド申請がきたときのおしらせ");
        NotificationChannel ring = new NotificationChannel(CH_RING, "電話がきたとき", NotificationManager.IMPORTANCE_HIGH);
        ring.setDescription("フレンドから電話がきたときのおしらせ");
        ring.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ring.enableVibration(true);
        nm.createNotificationChannel(call);
        nm.createNotificationChannel(wait);
        nm.createNotificationChannel(msg);
        nm.createNotificationChannel(ring);
    }

    /** おしたときにアプリを開く（target があれば、その画面を開く） */
    static PendingIntent open(Context c, String action, String target, int req) {
        Intent i = new Intent(c, MainActivity.class);
        if (action != null) i.setAction(action);
        if (target != null) i.putExtra(MainActivity.EXTRA_OPEN, target);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** おしたときに、アプリを開かずにたのむ（通話を切る・電話をことわる） */
    static PendingIntent service(Context c, String action, int req) {
        Intent i = new Intent(c, CallService.class).setAction(action);
        return PendingIntent.getService(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressWarnings("deprecation")
    static Notification.Builder builder(Context c, String ch) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat).setColor(0xFF5865F2);
        return b;
    }

    @SuppressWarnings("deprecation")
    static void show(Context c, String title, String text, String tag, String target) {
        if (c == null) return;
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        boolean call = "call".equals(tag);
        Notification.Builder b = builder(c, call ? CH_RING : CH_MSG)
                .setContentTitle(title == null ? "ふたりボイス" : title)
                .setContentText(text == null ? "" : text)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .setContentIntent(open(c, null, target, 10 + Math.abs(String.valueOf(tag).hashCode() % 1000)));
        if (call) {
            Icon ic = Icon.createWithResource(c, R.drawable.ic_stat);
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(45000);
            b.setCategory(Notification.CATEGORY_CALL)
             .addAction(new Notification.Action.Builder(ic, "ことわる", service(c, CallService.ACTION_DECLINE, 6)).build())
             .addAction(new Notification.Action.Builder(ic, "出る", open(c, MainActivity.ACTION_ANSWER, null, 7)).build());
        } else {
            b.setCategory(Notification.CATEGORY_MESSAGE);
        }
        nm.notify(tag == null ? "msg" : tag, 2, b.build());
    }

    static void cancel(Context c, String tag) {
        if (c == null) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(tag == null ? "msg" : tag, 2);
    }
}
