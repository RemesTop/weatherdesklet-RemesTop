const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;

// Specify Soup version to avoid the warning
imports.gi.versions.Soup = '2.4';
const Soup = imports.gi.Soup;

function SaaDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

SaaDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,
    
    _init: function(metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        
        // Initialize settings
        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], desklet_id);
        this.settings.bind("api-key", "apiKey", this.on_setting_changed);
        this.settings.bind("city", "city", this.on_setting_changed);
        this.settings.bind("update-interval", "updateInterval", this.on_setting_changed);
        
        this.setupUI();
    },
    
    setupUI: function() {
        this.window = new St.Bin();
        this.text = new St.Label();
        this.text.set_text("Sää ladataan...");
        this.window.set_child(this.text);
        this.setContent(this.window);
        
        this.haeSaa();
        
        // Päivitä sää määritetyin välein (muunnetaan minuutit sekunneiksi)
        this.updateLoop();
    },
    
    updateLoop: function() {
        if (this.timeout) {
            Mainloop.source_remove(this.timeout);
        }
        
        this.timeout = Mainloop.timeout_add_seconds(this.updateInterval * 60, () => {
            this.haeSaa();
            return true; // Jatka ajastusta
        });
    },
    
    on_setting_changed: function() {
        // Päivitä sää kun asetukset muuttuvat
        this.haeSaa();
        this.updateLoop(); // Päivitä myös ajastin
    },
    
    haeSaa: function() {
        // Tarkista että API-avain on asetettu
        if (!this.apiKey || this.apiKey.trim() === "") {
            this.text.set_text("Aseta API-avain asetuksista!\nHae avain: openweathermap.org");
            return;
        }
        
        let session = new Soup.SessionAsync();
        
        // Käytetään forecast API:a 5 päivän ennusteelle
        let url = `https://api.openweathermap.org/data/2.5/forecast?q=${this.city}&appid=${this.apiKey}&units=metric&lang=fi`;
        
        let message = Soup.Message.new("GET", url);
        
        session.queue_message(message, (session, message) => {
            try {
                if (message.status_code === 200) {
                    let responseText = message.response_body.data;
                    let data = JSON.parse(responseText);
                    
                    // Tämän päivän sää (ensimmäinen mittaus)
                    let tanaan = data.list[0];
                    let tanaanLampotila = Math.round(tanaan.main.temp);
                    let tanaanKuvaus = tanaan.weather[0].description;
                    
                    // Huomisen sää - etsitään huomisen keskipäivän sää (noin 12:00)
                    let huomenna = null;
                    let huomennanPvm = new Date();
                    huomennanPvm.setDate(huomennanPvm.getDate() + 1);
                    let huomennanPvmStr = huomennanPvm.toISOString().split('T')[0]; // YYYY-MM-DD
                    
                    for (let i = 0; i < data.list.length; i++) {
                        let aika = data.list[i].dt_txt;
                        if (aika.includes(huomennanPvmStr) && aika.includes('12:00:00')) {
                            huomenna = data.list[i];
                            break;
                        }
                    }
                    
                    // Jos ei löydy keskipäivän säätä, otetaan ensimmäinen huomisen sää
                    if (!huomenna) {
                        for (let i = 0; i < data.list.length; i++) {
                            let aika = data.list[i].dt_txt;
                            if (aika.includes(huomennanPvmStr)) {
                                huomenna = data.list[i];
                                break;
                            }
                        }
                    }
                    
                    let tekstiTulos = `${this.city}\nTänään: ${tanaanLampotila}°C, ${tanaanKuvaus}`;
                    
                    if (huomenna) {
                        let huomennaLampotila = Math.round(huomenna.main.temp);
                        let huomennaKuvaus = huomenna.weather[0].description;
                        tekstiTulos += `\nHuomenna: ${huomennaLampotila}°C, ${huomennaKuvaus}`;
                    }
                    
                    this.text.set_text(tekstiTulos);
                } else if (message.status_code === 401) {
                    this.text.set_text("Virheellinen API-avain!\nTarkista asetukset.");
                } else if (message.status_code === 404) {
                    this.text.set_text("Kaupunkia ei löytynyt!\nTarkista kaupungin nimi.");
                } else {
                    this.text.set_text("Virhe sään haussa: " + message.status_code);
                }
            } catch (e) {
                global.logError(e);
                this.text.set_text("Virhe sään haussa: " + e.message);
            }
        });
    },
    
    on_desklet_removed: function() {
        if (this.timeout) {
            Mainloop.source_remove(this.timeout);
        }
    }
};

function main(metadata, desklet_id) {
    return new SaaDesklet(metadata, desklet_id);
}