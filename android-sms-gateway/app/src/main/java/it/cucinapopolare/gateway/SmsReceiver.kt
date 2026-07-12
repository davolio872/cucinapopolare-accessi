package it.cucinapopolare.gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsManager
import kotlin.concurrent.thread

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val from = messages.firstOrNull()?.originatingAddress.orEmpty()
        val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }
        if (from.isBlank() || body.isBlank()) return

        thread {
            val response = GatewayApi.requestBooking(
                context = context.applicationContext,
                from = from,
                body = body,
                channel = "sms",
                providerMessageId = "sms-${System.currentTimeMillis()}",
            )
            if (GatewayConfig.isSmsReplyEnabled(context) && response.sendReply && response.reply.isNotBlank()) {
                sendSms(from, response.reply)
            }
        }
    }

    private fun sendSms(number: String, message: String) {
        SmsManager.getDefault().sendTextMessage(number, null, message, null, null)
    }
}
