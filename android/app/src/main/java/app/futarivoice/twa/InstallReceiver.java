package app.futarivoice.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.util.Log;

/** アップデートの結果を受け取る。入れかえが終わったら「アップデートできたよ」のおしらせを出す */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context c, Intent i) {
        String action = i.getAction();
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Notifs.channels(c);
            Notifs.show(c, "アップデートできたよ！", "タップして、ふたりボイスを開いてね", "updated", null);
            return;
        }
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = Build.VERSION.SDK_INT >= 33
                    ? i.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                    : (Intent) i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) { Updater.cb("error", "インストールの画面を出せなかった"); return; }
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                c.startActivity(confirm);
                Updater.cb("confirm", "");
            } catch (Exception e) {
                Log.w("FV", "confirm", e);
                Updater.cb("error", "インストールの画面を出せなかった");
            }
        } else if (st == PackageInstaller.STATUS_SUCCESS) {
            Updater.cb("done", "");
        } else if (st == PackageInstaller.STATUS_FAILURE_ABORTED) {
            Updater.cb("cancel", "");
        } else {
            Updater.cb("error", String.valueOf(i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)));
        }
    }
}
