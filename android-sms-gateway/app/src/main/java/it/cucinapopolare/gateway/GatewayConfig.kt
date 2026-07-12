package it.cucinapopolare.gateway

import android.content.Context

object GatewayConfig {
    private const val PREFS = "gateway_config"
    private const val KEY_URL = "url"
    private const val KEY_SECRET = "secret"
    private const val KEY_SMS_REPLY = "sms_reply"
    private const val KEY_CALL_BOOKING = "call_booking"
    private const val KEY_LAST_EVENT = "last_event"

    private const val DEFAULT_URL =
        "https://cucinapopolare-accessi.vercel.app/api/webhooks/android-gateway"

    fun getUrl(context: Context): String =
        prefs(context).getString(KEY_URL, DEFAULT_URL) ?: DEFAULT_URL

    fun getSecret(context: Context): String =
        prefs(context).getString(KEY_SECRET, "") ?: ""

    fun isSmsReplyEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_SMS_REPLY, true)

    fun isCallBookingEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_CALL_BOOKING, false)

    fun getLastEvent(context: Context): String =
        prefs(context).getString(KEY_LAST_EVENT, "Nessun evento registrato.") ?: "Nessun evento registrato."

    fun saveLastEvent(context: Context, message: String) {
        prefs(context).edit()
            .putString(KEY_LAST_EVENT, message)
            .apply()
    }

    fun save(
        context: Context,
        url: String,
        secret: String,
        smsReplyEnabled: Boolean,
        callBookingEnabled: Boolean,
    ) {
        prefs(context).edit()
            .putString(KEY_URL, url.trim())
            .putString(KEY_SECRET, secret.trim())
            .putBoolean(KEY_SMS_REPLY, smsReplyEnabled)
            .putBoolean(KEY_CALL_BOOKING, callBookingEnabled)
            .apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
