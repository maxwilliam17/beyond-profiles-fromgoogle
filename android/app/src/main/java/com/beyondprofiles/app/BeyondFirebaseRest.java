package com.beyondprofiles.app;

import android.content.Context;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class BeyondFirebaseRest {

    private static final int MAX_REDIRECTS = 5;

    private BeyondFirebaseRest() {}

    public static String encodeSegment(String segment) {
        try {
            return URLEncoder.encode(segment, "UTF-8").replace("+", "%20");
        } catch (Exception e) {
            return segment;
        }
    }

    public static HttpURLConnection openStreamConnection(String urlStr) throws IOException {
        String currentUrl = urlStr;
        for (int i = 0; i < MAX_REDIRECTS; i++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "text/event-stream");
            conn.setRequestProperty("Cache-Control", "no-cache");
            conn.setRequestProperty("Connection", "keep-alive");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(65000);
            conn.connect();

            int code = conn.getResponseCode();
            if (isRedirect(code)) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.isEmpty()) {
                    throw new IOException("Redirect without Location header");
                }
                currentUrl = new URL(new URL(currentUrl), location).toString();
                continue;
            }
            if (code >= 200 && code < 300) {
                return conn;
            }
            conn.disconnect();
            throw new IOException("SSE HTTP status " + code);
        }
        throw new IOException("Too many redirects for SSE stream");
    }

    public static String getJson(String urlStr) throws IOException {
        String currentUrl = urlStr;
        for (int i = 0; i < MAX_REDIRECTS; i++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            try {
                int code = conn.getResponseCode();
                if (isRedirect(code)) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.isEmpty()) {
                        throw new IOException("Redirect without Location header");
                    }
                    currentUrl = new URL(new URL(currentUrl), location).toString();
                    continue;
                }
                if (code < 200 || code >= 300) {
                    throw new IOException("GET HTTP status " + code);
                }
                return readAll(conn.getInputStream());
            } finally {
                conn.disconnect();
            }
        }
        throw new IOException("Too many redirects for GET");
    }

    public static boolean writeJson(String method, String urlStr, String jsonBody) {
        String currentUrl = urlStr;
        for (int i = 0; i < MAX_REDIRECTS; i++) {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(currentUrl).openConnection();
                conn.setInstanceFollowRedirects(false);
                if ("PATCH".equalsIgnoreCase(method)) {
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
                } else {
                    conn.setRequestMethod(method);
                }
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(12000);
                conn.setDoOutput(true);
                byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                    os.flush();
                }

                int code = conn.getResponseCode();
                if (isRedirect(code)) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.isEmpty()) return false;
                    currentUrl = new URL(new URL(currentUrl), location).toString();
                    continue;
                }
                return code >= 200 && code < 300;
            } catch (Exception e) {
                return false;
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return false;
    }

    public static boolean sendReplyMessage(Context context, String kind, String convoId, String text) {
        String myId = BeyondStateStore.getProfileId(context);
        String myName = BeyondStateStore.getProfileName(context);
        if (myId.isEmpty() || convoId == null || convoId.isEmpty() || text == null) {
            return false;
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) return false;

        String dbUrl = BeyondStateStore.getDbUrl(context);
        String node = "group".equals(kind) ? "groups" : "chats";
        String encodedConvo = encodeSegment(convoId);
        String encodedMyId = encodeSegment(myId);
        long now = System.currentTimeMillis();

        try {
            JSONObject msgObj = new JSONObject();
            msgObj.put("senderId", myId);
            msgObj.put("senderName", myName.isEmpty() ? "You" : myName);
            msgObj.put("text", trimmed);
            msgObj.put("createdAt", now);

            boolean msgOk = writeJson(
                "POST",
                dbUrl + "/" + node + "/" + encodedConvo + "/messages.json",
                msgObj.toString()
            );
            if (!msgOk) return false;

            String preview = trimmed.length() > 80 ? trimmed.substring(0, 80) + "\u2026" : trimmed;
            JSONObject metaObj = new JSONObject();
            metaObj.put("lastMessage", preview);
            metaObj.put("lastAt", now);
            metaObj.put("lastSenderId", myId);
            writeJson("PATCH", dbUrl + "/" + node + "/" + encodedConvo + "/meta.json", metaObj.toString());

            writeJson(
                "PUT",
                dbUrl + "/" + node + "/" + encodedConvo + "/reads/" + encodedMyId + ".json",
                String.valueOf(now)
            );
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean markConversationRead(Context context, String kind, String convoId) {
        String myId = BeyondStateStore.getProfileId(context);
        if (myId.isEmpty() || convoId == null || convoId.isEmpty()) return false;
        String dbUrl = BeyondStateStore.getDbUrl(context);
        String node = "group".equals(kind) ? "groups" : "chats";
        long now = System.currentTimeMillis();
        return writeJson(
            "PUT",
            dbUrl + "/" + node + "/" + encodeSegment(convoId) + "/reads/" + encodeSegment(myId) + ".json",
            String.valueOf(now)
        );
    }

    public static boolean declineCall(Context context, String callId) {
        if (callId == null || callId.isEmpty()) return false;
        String dbUrl = BeyondStateStore.getDbUrl(context);
        return writeJson(
            "PUT",
            dbUrl + "/calls/" + encodeSegment(callId) + "/status.json",
            "\"declined\""
        );
    }

    private static boolean isRedirect(int code) {
        return code == 301 || code == 302 || code == 303 || code == 307 || code == 308;
    }

    private static String readAll(InputStream is) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append('\n');
            }
        }
        return sb.toString();
    }
}
