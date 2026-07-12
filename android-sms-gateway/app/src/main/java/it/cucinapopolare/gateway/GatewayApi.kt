package it.cucinapopolare.gateway

import android.content.Context
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class GatewayResponse(
    val ok: Boolean,
    val reply: String,
    val sendReply: Boolean,
)

object GatewayApi {
    fun requestBooking(
        context: Context,
        from: String,
        body: String,
        channel: String,
        providerMessageId: String?,
    ): GatewayResponse {
        val endpoint = GatewayConfig.getUrl(context)
        val secret = GatewayConfig.getSecret(context)
        if (endpoint.isBlank() || secret.isBlank()) {
            return GatewayResponse(false, "Gateway non configurato.", false)
        }

        val payload = JSONObject()
            .put("from", from)
            .put("body", body)
            .put("channel", channel)
            .put("providerMessageId", providerMessageId)

        val connection = URL(endpoint).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 10000
        connection.readTimeout = 15000
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        connection.setRequestProperty("X-CPG-Gateway-Secret", secret)

        OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
            writer.write(payload.toString())
        }

        val stream = if (connection.responseCode in 200..299) {
            connection.inputStream
        } else {
            connection.errorStream
        }

        val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        val json = runCatching { JSONObject(responseText) }.getOrNull()

        return GatewayResponse(
            ok = json?.optBoolean("ok") ?: false,
            reply = json?.optString("reply") ?: "Risposta non disponibile.",
            sendReply = json?.optBoolean("sendReply") ?: false,
        )
    }
}
