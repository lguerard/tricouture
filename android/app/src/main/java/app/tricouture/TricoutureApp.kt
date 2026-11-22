package app.tricouture

import android.app.Application
import app.tricouture.data.I18n
import app.tricouture.data.Session
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache

class TricoutureApp : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        Session.init(this)
        I18n.init(this)
    }

    // Les images du site (couvertures, photos) demandent la session : Coil
    // passe par le même client HTTP, qui ajoute le jeton.
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .callFactory { Session.kit.http }
        .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.2).build() }
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("images")).maxSizeBytes(200L * 1024 * 1024).build() }
        .crossfade(true)
        .build()
}
