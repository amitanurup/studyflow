package com.studyflow.upismsbridge

import android.content.Context
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object SmsForwarder {
    const val PREFS = "upi_sms_bridge"
    const val KEY_ENDPOINT = "endpoint"

    fun looksLikeCreditSms(message: String): Boolean {
        val text = message.lowercase()
        val hasAmount = Regex("""(rs\.?|inr|₹)\s*[0-9]""").containsMatchIn(text)
        val hasCredit = listOf("credited", "received", "deposited", " credit", " cr ").any { text.contains(it) }
        val hasDebit = listOf("debited", "spent", "sent", "paid", "withdrawn", " debit", " dr ").any { text.contains(it) }
        return hasAmount && hasCredit && !hasDebit
    }

    fun forward(context: Context, sender: String, message: String) {
        val endpoint = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_ENDPOINT, "")
            .orEmpty()
        if (endpoint.isBlank()) return

        Thread {
            try {
                val connection = URL(endpoint).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                val payload = JSONObject()
                    .put("sender", sender)
                    .put("sms", message)
                    .toString()
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(payload) }
                connection.inputStream.close()
                connection.disconnect()
            } catch (_: Exception) {
                // Keep receiver quiet; user can test endpoint from the app screen.
            }
        }.start()
    }
}
