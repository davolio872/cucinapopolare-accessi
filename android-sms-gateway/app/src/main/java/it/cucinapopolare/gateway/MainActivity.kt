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
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var endpointInput: EditText
    private lateinit var secretInput: EditText
    private lateinit var smsReplyCheck: CheckBox

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissions()
        setContentView(buildView())
    }

    private fun buildView(): LinearLayout {
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
        val saveButton = Button(this).apply {
            text = "Salva"
            setOnClickListener {
                GatewayConfig.save(
                    this@MainActivity,
                    endpointInput.text.toString(),
                    secretInput.text.toString(),
                    smsReplyCheck.isChecked,
                )
                Toast.makeText(this@MainActivity, "Configurazione salvata.", Toast.LENGTH_SHORT).show()
            }
        }

        val title = TextView(this).apply {
            text = "Gateway Cucina Popolare"
            textSize = 24f
            gravity = Gravity.CENTER
        }
        val note = TextView(this).apply {
            text = "Installa l'app sul telefono con SIM dedicata. Gli SMS con PRENOTO dai numeri registrati vengono inviati al gestionale."
            textSize = 14f
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(title)
            addView(note)
            addView(endpointInput)
            addView(secretInput)
            addView(smsReplyCheck)
            addView(saveButton)
        }
    }

    private fun requestPermissions() {
        val permissions = arrayOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.SEND_SMS,
        ).filter {
            checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (permissions.isNotEmpty()) {
            requestPermissions(permissions, 100)
        }
    }
}
