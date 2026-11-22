plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "app.tricouture"
    compileSdk = 35

    defaultConfig {
        // Même identifiant que l'ancienne appli (Capacitor) : la nouvelle la
        // remplacera à l'installation, signée avec la même clé.
        applicationId = "app.tricouture"
        minSdk = 26
        targetSdk = 35
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "dev"
        resValue("string", "app_name", "Tricouture")
    }

    buildTypes {
        // Version de test : s'installe à côté de l'appli publiée (autre
        // identifiant, autre nom), pour l'essayer sans rien remplacer.
        debug {
            applicationIdSuffix = ".test"
            resValue("string", "app_name", "Tricouture (test)")
        }
        // Tant que les releases publient aussi l'ancienne appli, la native
        // s'installe à côté : -PappIdSuffix=.native lui donne un autre
        // identifiant et un autre nom.
        release {
            val suffix = (project.findProperty("appIdSuffix") as String?).orEmpty()
            if (suffix.isNotEmpty()) {
                applicationIdSuffix = suffix
                resValue("string", "app_name", "Tricouture (natif)")
            }
            // Pas de R8 pour l'instant : rien ne le vérifie à l'exécution avant
            // la publication, et une classe retirée à tort ferait planter l'appli.
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.gson)
    implementation(libs.coil.compose)
    implementation(libs.datastore.preferences)
    implementation(libs.coroutines.android)
    implementation(libs.mlkit.barcode)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.exifinterface)
    debugImplementation(libs.androidx.ui.tooling)
}
