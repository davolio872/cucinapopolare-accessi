package it.cucinapopolare.gateway

import android.content.Context

object GatewayConfig {
    private const val PREFS = "gateway_config"
    private const val KEY_URL = "url"
    private const val KEY_SECRET = "secret"
    private const val KEY_SMS_REPLY = "sms_reply"

    fun getUrl(context: Context): String =
        prefs(context).getString(KEY_URL, "") ?: ""

    fun getSecret(context: Context): String =
        prefs(context).getString(KEY_SECRET, "") ?: ""

    fun isSmsReplyEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_SMS_REPLY, true)

    fun save(
        context: Context,
        url: String,
        secret: String,
        smsReplyEnabled: Boolean,
    ) {
        prefs(context).edit()
            .putString(KEY_URL, url.trim())
            .putString(KEY_SECRET, secret.trim())
            .putBoolean(KEY_SMS_REPLY, smsReplyEnabled)
            .apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
