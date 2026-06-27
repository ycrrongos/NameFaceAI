package com.nameface.rokid

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.nameface.rokid.databinding.ActivitySettingsBinding

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private var discovering = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.frontendHostInput.setText(Prefs.getFrontendHost(this))
        binding.backendHostInput.setText(Prefs.getBackendHost(this))
        binding.useHttpsSwitch.isChecked = Prefs.useHttps(this)
        binding.allowInsecureSslSwitch.isChecked = Prefs.allowInsecureSsl(this)

        binding.discoverButton.setOnClickListener {
            if (!discovering) runDiscovery()
        }

        binding.saveButton.setOnClickListener {
            val frontend = binding.frontendHostInput.text?.toString()?.trim().orEmpty()
            val backend = binding.backendHostInput.text?.toString()?.trim().orEmpty()
            if (frontend.isBlank() || backend.isBlank()) {
                Toast.makeText(this, R.string.settings_invalid, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            Prefs.save(
                context = this,
                frontendHost = frontend,
                backendHost = backend,
                useHttps = binding.useHttpsSwitch.isChecked,
                allowInsecureSsl = binding.allowInsecureSslSwitch.isChecked,
            )
            Toast.makeText(this, R.string.settings_saved, Toast.LENGTH_SHORT).show()
            setResult(RESULT_OK)
            finish()
        }
    }

    private fun runDiscovery() {
        discovering = true
        setDiscoveryUi(true)
        ServerDiscovery.discover { result ->
            runOnUiThread {
                discovering = false
                setDiscoveryUi(false)
                if (result == null) {
                    Toast.makeText(this, R.string.discover_failed, Toast.LENGTH_LONG).show()
                    return@runOnUiThread
                }
                binding.frontendHostInput.setText(result.frontendHost)
                binding.backendHostInput.setText(result.backendHost)
                binding.useHttpsSwitch.isChecked = result.useHttps
                binding.allowInsecureSslSwitch.isChecked = true
                Toast.makeText(
                    this,
                    getString(R.string.discover_success, result.backendHost),
                    Toast.LENGTH_SHORT,
                ).show()
            }
        }
    }

    private fun setDiscoveryUi(active: Boolean) {
        binding.discoverButton.isEnabled = !active
        binding.saveButton.isEnabled = !active
        binding.discoverButton.text = if (active) {
            getString(R.string.discovering)
        } else {
            getString(R.string.discover_servers)
        }
    }
}
