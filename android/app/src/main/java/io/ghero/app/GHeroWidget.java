package io.ghero.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Scanner;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home-screen tiles. Reads what the app saved (CapacitorStorage), refetches with the same token, keeps the last values offline. */
public class GHeroWidget extends AppWidgetProvider {
    /** Open PRs of the saved repository. */
    public static class Repo extends GHeroWidget {}
    /** Repository count and open PRs of the saved organization. */
    public static class Org extends GHeroWidget {}

    static final String QUERY = "query($owner:String!,$name:String!,$org:String!){"
        + "repository(owner:$owner,name:$name){pullRequests(states:OPEN){totalCount} issues(states:OPEN){totalCount} stargazerCount}"
        + "organization(login:$org){repositories(first:100){totalCount nodes{pullRequests(states:OPEN){totalCount}}}}}";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        draw(context, manager, prefs);
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                fetch(prefs);
                draw(context, manager, prefs);
            } catch (Exception ignored) {
                // Offline or bad token: the last values stay.
            } finally {
                pending.finish();
            }
        }).start();
    }

    void draw(Context context, AppWidgetManager manager, SharedPreferences prefs) {
        boolean org = this instanceof Org;
        String num = "–";
        String sub = prefs.getString(org ? "org" : "repo", "");
        try {
            JSONObject s = new JSONObject(prefs.getString("stats", "{}"));
            if (s.has("prs")) num = String.valueOf(s.getInt(org ? "orgRepos" : "prs"));
            if (org && s.has("orgPrs")) sub += " · " + s.getInt("orgPrs") + " open PRs";
        } catch (Exception ignored) {}
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget);
        v.setTextViewText(R.id.num, num);
        v.setTextViewText(R.id.label, org ? "Repositories" : "Open PRs");
        v.setTextViewText(R.id.sub, sub.isEmpty() ? "Open GHero to sign in" : sub);
        v.setOnClickPendingIntent(R.id.root,
            PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(new ComponentName(context, getClass()), v);
    }

    static void fetch(SharedPreferences prefs) throws Exception {
        String token = prefs.getString("token", null), repo = prefs.getString("repo", ""), org = prefs.getString("org", "");
        if (token == null || !repo.contains("/")) return;
        String[] r = repo.split("/", 2);
        JSONObject vars = new JSONObject().put("owner", r[0]).put("name", r[1]).put("org", org);
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/graphql").openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Authorization", "Bearer " + token);
        try (OutputStream o = c.getOutputStream()) {
            o.write(new JSONObject().put("query", QUERY).put("variables", vars).toString().getBytes("UTF-8"));
        }
        if (c.getResponseCode() != 200) return;
        String body;
        try (InputStream in = c.getInputStream(); Scanner sc = new Scanner(in, "UTF-8").useDelimiter("\\A")) {
            body = sc.next();
        }
        JSONObject d = new JSONObject(body).optJSONObject("data");
        if (d == null || d.isNull("repository") || d.isNull("organization")) return;
        JSONObject rep = d.getJSONObject("repository");
        JSONObject repos = d.getJSONObject("organization").getJSONObject("repositories");
        JSONArray nodes = repos.getJSONArray("nodes");
        int orgPrs = 0;
        for (int i = 0; i < nodes.length(); i++) orgPrs += nodes.getJSONObject(i).getJSONObject("pullRequests").getInt("totalCount");
        // Merge, so the app's own fields (langs) survive.
        JSONObject s = new JSONObject(prefs.getString("stats", "{}"))
            .put("repo", repo).put("org", org).put("at", System.currentTimeMillis())
            .put("prs", rep.getJSONObject("pullRequests").getInt("totalCount"))
            .put("issues", rep.getJSONObject("issues").getInt("totalCount"))
            .put("stars", rep.getInt("stargazerCount"))
            .put("orgRepos", repos.getInt("totalCount"))
            .put("orgPrs", orgPrs);
        prefs.edit().putString("stats", s.toString()).apply();
    }
}
