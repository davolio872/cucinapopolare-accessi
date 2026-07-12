package it.cucinapopolare.gateway

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var endpointInput: EditText
    private lateinit var secretInput: EditText
    private lateinit var smsReplyCheck: CheckBox
    private lateinit var callBookingCheck: CheckBox
    private lateinit var statusText: TextView
    private lateinit var lastEventText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissions()
        setContentView(buildView())
        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        if (::statusText.isInitialized) refreshStatus()
    }

    private fun buildView(): ScrollView {
        endpointInput = EditText(this).apply {
            hint = "URL endpoint gateway"
            setSingleLine(true)
            setText(GatewayConfig.getUrl(this@MainActivity))
        }
        secretInput = EditText(this).apply {
            hint = "Segreto gateway"
            setSingleLine(true)
            setText(GatewayConfig.getSecret(this@MainActivity))
        }
        smsReplyCheck = CheckBox(this).apply {
            text = "Rispondi automaticamente agli SMS"
            isChecked = GatewayConfig.isSmsReplyEnabled(this@MainActivity)
        }
        callBookingCheck = CheckBox(this).apply {
            text = "Prenota da chiamate ricevute"
            isChecked = GatewayConfig.isCallBookingEnabled(this@MainActivity)
        }
        statusText = TextView(this).apply {
            textSize = 16f
        }
        lastEventText = TextView(this).apply {
            textSize = 14f
        }

        val saveButton = Button(this).apply {
            text = "Salva"
            setOnClickListener {
                saveConfig()
                Toast.makeText(this@MainActivity, "Configurazione salvata.", Toast.LENGTH_SHORT).show()
            }
        }
        val testButton = Button(this).apply {
            text = "Test connessione"
            setOnClickListener {
                saveConfig()
                statusText.text = "Test in corso..."
                thread {
                    val response = GatewayApi.testConnection(this@MainActivity.applicationContext)
                    GatewayConfig.saveLastEvent(this@MainActivity, "Test connessione: ${response.reply}")
                    runOnUiThread {
                        refreshStatus()
                        Toast.makeText(this@MainActivity, response.reply, Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        val title = TextView(this).apply {
            text = "Gateway Cucina Popolare"
            textSize = 24f
            gravity = Gravity.CENTER
        }
        val note = TextView(this).apply {
            text = "SMS: invia PRENOTO al numero della SIM. Chiamate: opzionale, registra la prenotazione e risponde via SMS."
            textSize = 14f
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(title)
            addView(note)
            addView(statusText)
            addView(endpointInput)
            addView(secretInput)
            addView(smsReplyCheck)
            addView(callBookingCheck)
            addView(saveButton)
            addView(testButton)
            addView(lastEventText)
        }

        return ScrollView(this).apply {
            addView(content)
        }
    }

    private fun saveConfig() {
        GatewayConfig.save(
            this,
            endpointInput.text.toString(),
            secretInput.text.toString(),
            smsReplyCheck.isChecked,
            callBookingCheck.isChecked,
        )
        refreshStatus()
    }

    private fun refreshStatus() {
        val configured = GatewayConfig.getUrl(this).isNotBlank() && GatewayConfig.getSecret(this).isNotBlank()
        val smsPermission = hasPermission(Manifest.permission.RECEIVE_SMS)
        val sendPermission = hasPermission(Manifest.permission.SEND_SMS)
        val callPermission = hasPermission(Manifest.permission.READ_PHONE_STATE)
        val callLogPermission = hasPermission(Manifest.permission.READ_CALL_LOG)

        statusText.text = buildString {
            append(if (configured) "Configurazione: completa" else "Configurazione: incompleta")
            append("\nSMS: ")
            append(if (smsPermission && sendPermission) "permessi ok" else "permessi mancanti")
            append("\nTelefonate: ")
            append(if (callPermission && callLogPermission) "permessi ok" else "permessi mancanti")
        }
        lastEventText.text = "Ultimo evento:\n${GatewayConfig.getLastEvent(this)}"
    }

    private fun requestPermissions() {
        val permissions = arrayOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
        ).filter {
            !hasPermission(it)
        }.toTypedArray()

        if (permissions.isNotEmpty()) {
            requestPermissions(permissions, 100)
        }
    }

    private fun hasPermission(permission: String) =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
}
