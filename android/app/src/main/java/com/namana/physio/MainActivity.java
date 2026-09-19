package com.namana.physio;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new AndroidNativeDownloader(this), "AndroidDownloader");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static class AndroidNativeDownloader {
        private final Context context;
        private final Handler mainHandler;

        public AndroidNativeDownloader(Context context) {
            this.context = context;
            this.mainHandler = new Handler(Looper.getMainLooper());
        }

        @JavascriptInterface
        public boolean saveBase64(String base64Data, String fileName, String mimeType) {
            try {
                if (base64Data == null || fileName == null) return false;
                String cleanBase64 = base64Data;
                if (cleanBase64.contains(",")) {
                    cleanBase64 = cleanBase64.substring(cleanBase64.indexOf(",") + 1);
                }
                byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                return saveBytesToFile(bytes, fileName, mimeType);
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public boolean saveText(String textData, String fileName, String mimeType) {
            try {
                if (textData == null || fileName == null) return false;
                byte[] bytes = textData.getBytes(StandardCharsets.UTF_8);
                return saveBytesToFile(bytes, fileName, mimeType);
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        private boolean saveBytesToFile(byte[] bytes, String fileName, String mimeType) {
            boolean saved = false;
            Uri fileUri = null;

            // 1. Android Q (10) and above: Save directly to Public MediaStore Downloads
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    fileUri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (fileUri != null) {
                        try (OutputStream os = context.getContentResolver().openOutputStream(fileUri)) {
                            if (os != null) {
                                os.write(bytes);
                                os.flush();
                                saved = true;
                            }
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }

            // 2. Fallback to Environment.DIRECTORY_DOWNLOADS or App External Documents
            if (!saved) {
                try {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File outFile = new File(downloadsDir, fileName);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                        fos.flush();
                        saved = true;
                    }
                    fileUri = FileProvider.getUriForFile(
                        context,
                        context.getPackageName() + ".fileprovider",
                        outFile
                    );
                } catch (Exception e) {
                    try {
                        File cacheDir = context.getExternalCacheDir() != null ? context.getExternalCacheDir() : context.getCacheDir();
                        File outFile = new File(cacheDir, fileName);
                        try (FileOutputStream fos = new FileOutputStream(outFile)) {
                            fos.write(bytes);
                            fos.flush();
                            saved = true;
                        }
                        fileUri = FileProvider.getUriForFile(
                            context,
                            context.getPackageName() + ".fileprovider",
                            outFile
                        );
                    } catch (Exception e2) {
                        e2.printStackTrace();
                    }
                }
            }

            if (saved) {
                final Uri finalUri = fileUri;
                mainHandler.post(() -> {
                    Toast.makeText(context, "Downloaded & saved to Downloads: " + fileName, Toast.LENGTH_LONG).show();
                    if (finalUri != null) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_SEND);
                            intent.setType(mimeType);
                            intent.putExtra(Intent.EXTRA_STREAM, finalUri);
                            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            Intent chooser = Intent.createChooser(intent, "Download / Open " + fileName);
                            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            context.startActivity(chooser);
                        } catch (Exception e) {
                            // File is already saved to Downloads folder
                        }
                    }
                });
                return true;
            }
            return false;
        }
    }
}

