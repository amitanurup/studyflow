package com.studyflow.upismsbridge

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var urlInput: EditText
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences(SmsForwarder.PREFS, MODE_PRIVATE)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 42, 36, 36)
        }

        val title = TextView(this).apply {
            text = "UPI SMS Bridge"
            textSize = 26f
        }
        val help = TextView(this).apply {
            text = "PC endpoint set karo. Example: http://192.168.1.8:4180/api/sms-payment"
            textSize = 14f
            setPadding(0, 12, 0, 18)
        }
        urlInput = EditText(this).apply {
            hint = "PC SMS endpoint"
            setSingleLine(true)
            setText(prefs.getString(SmsForwarder.KEY_ENDPOINT, ""))
        }
        val saveButton = Button(this).apply {
            text = "Save endpoint"
            setOnClickListener {
                prefs.edit().putString(SmsForwarder.KEY_ENDPOINT, urlInput.text.toString().trim()).apply()
                Toast.makeText(this@MainActivity, "Endpoint saved", Toast.LENGTH_SHORT).show()
                updateStatus()
            }
        }
        val permissionButton = Button(this).apply {
            text = "Allow SMS permission"
            setOnClickListener {
                requestPermissions(arrayOf(Manifest.permission.RECEIVE_SMS), 10)
            }
        }
        val testButton = Button(this).apply {
            text = "Send test SMS alert to PC"
            setOnClickListener {
                SmsForwarder.forward(
                    this@MainActivity,
                    "TESTBANK",
                    "Rs.50.00 credited to your account from AMIT via UPI. UTR 123456789012"
                )
                Toast.makeText(this@MainActivity, "Test sent", Toast.LENGTH_SHORT).show()
            }
        }
        statusText = TextView(this).apply {
            textSize = 13f
            setPadding(0, 18, 0, 0)
        }

        layout.addView(title)
        layout.addView(help)
        layout.addView(urlInput)
        layout.addView(saveButton)
        layout.addView(permissionButton)
        layout.addView(testButton)
        layout.addView(statusText)
        setContentView(layout)
        updateStatus()
    }

    private fun updateStatus() {
        val hasSms = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
        val endpoint = getSharedPreferences(SmsForwarder.PREFS, MODE_PRIVATE)
            .getString(SmsForwarder.KEY_ENDPOINT, "")
            .orEmpty()
        statusText.text = "SMS permission: ${if (hasSms) "allowed" else "not allowed"}\nEndpoint: ${endpoint.ifBlank { "not set" }}"
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        updateStatus()
    }
}
