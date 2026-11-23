plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "app.tricouture"
    compileSdk = 35

    defaultConfig {
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
        // Les releases passent -PappIdSuffix=.native : c'est l'identifiant
        // sous lequel l'appli est installée sur les téléphones (elle a d'abord
        // vécu à côté de l'ancienne appli Capacitor, retirée depuis). Le
        // changer obligerait à la réinstaller.
        release {
            val suffix = (project.findProperty("appIdSuffix") as String?).orEmpty()
            if (suffix.isNotEmpty()) applicationIdSuffix = suffix
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
