package it.cucinapopolare.gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import kotlin.concurrent.thread

class PhoneCallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        if (state != TelephonyManager.EXTRA_STATE_RINGING) return
        if (!GatewayConfig.isCallReplyEnabled(context)) return

        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER).orEmpty()
        if (number.isBlank()) return

        thread {
            val response = GatewayApi.requestBooking(
                context = context.applicationContext,
                from = number,
                body = "Chiamata ricevuta",
                channel = "telefono",
                providerMessageId = "call-${System.currentTimeMillis()}",
            )
            if (response.sendReply && response.reply.isNotBlank()) {
                sendSms(number, response.reply)
            }
        }
    }

    private fun sendSms(number: String, message: String) {
        SmsManager.getDefault().sendTextMessage(number, null, message, null, null)
    }
}
