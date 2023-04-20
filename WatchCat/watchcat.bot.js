module.exports = {
    name: "WatchcatModule",
    defs:{
        CommandsWatcher: undefined,
        EventsWatcher: undefined
    },
    plugs: {
        WatchCat: () => {
            var fs = require('fs'), events = require('events'), path = require('path');
            let PerformWatch = function(src, options) {
                var watcher = new Watchcat(options);
                watcher.watch(src);
                return watcher;
            }
            class Watchcat extends events.EventEmitter{
                constructor(options) {
                    super();
                    this.options = options || {};
                    this.watchers = [];
                }
                watch(src) {
                    var self = this
                    var stats = fs.statSync(src)
                    var lastChange = null
                    var watchFn = self.options.watchFn || fs.watch
                    if (stats.isDirectory()) {
                        var files = fs.readdirSync(src)
                        for (var i = 0, len = files.length; i < len; i++) {
                            self.watch(src + path.sep + files[i])
                        }
                    }
                    self.watchers[src] = watchFn(src, function(event, filename) {
                        if (fs.existsSync(src)) {
                            stats = fs.statSync(src)
                            if (stats.isFile()) {
                                if (lastChange === null || stats.mtime.getTime() > (lastChange + 1))
                                self.emit('change', src, stats);
                                lastChange = stats.mtime.getTime();
                            } else if (stats.isDirectory()) {
                               // Check if the dir is new
                               if (self.watchers[src] === undefined) {
                                self.emit('create', src, stats)
                            }
                                // Check files to see if there are any new files
                                var dirFiles = fs.readdirSync(src)
                                for (var i = 0, len = dirFiles.length; i < len; i++) {
                                    var file = src + path.sep + dirFiles[i]
                                    if (self.watchers[file] === undefined) {
                                        self.watch(file)
                                        self.emit('create', file, fs.statSync(file))
                                    }
                                }
                            }
                        } else {
                            self.unwatch(src)
                            self.emit('delete', src)
                        }
                    })
                    self.emit('watch', src)    
                }
                unwatch(src) {
                    var self = this
                    if (self.watchers[src] !== undefined) {
                        if (isset(self.watchers[src].close)) self.watchers[src].close()
                        delete self.watchers[src]
                    }
                    self.emit('unwatch', src)
                }
                clear() {
                    var self = this
                    for (var file in this.watchers) {
                        self.unwatch(file)
                    }
                }  
            }
            return {Watchcat, PerformWatch};
        }
    },
    start() {
        // Let's prepare the utils
        const {PerformWatch} = module.exports.plugs.WatchCat();
        const {sep} = require('path');

        // Let's prepare the base
        let botWorkingDirectory = require.main.path + "/" + process.configuration["Kyst.Bot.WorkingDirectory"];
        let BWFCommands = botWorkingDirectory + "/commands";
        let BWFEvents = botWorkingDirectory + "/events";

        // Let's create our listeners
        let WatchCMDHandle = function(hand, file){
            debug(hand,`${file}`);
            if (!file.endsWith(".js")) return;
            if (hand == "LOAD"){
                delete require.cache[require.resolve(file)];
                let module = require(file);
                if (!(isset(module.structure)) && !(isset(module.run))) return;
                Bot.addCommand(module);
                debug("COMMAND LOAD", module.structure.name + " (" + file + ")");
            } else if (hand == "RELOAD"){
                delete require.cache[require.resolve(file)];
                let module = require(file);
                if (!(isset(module.structure)) && !(isset(module.run))) return;
                Bot.removeCommand(module.structure.name);
                Bot.addCommand(module);
                debug("COMMAND RELOAD", module.structure.name + " (" + file + ")");
            } else if (hand == "REMOVE"){
                Bot.removeCommand(file.split(sep).pop().split(".js")[0]);
                debug("COMMAND REMOVE", file.split(sep).pop().split(".js")[0] + " (" + file + ")");
            }
        }

        let WatchEVTHandle = function(hand, file){
            debug(hand,`${file}`);
            if (!file.endsWith(".js")) return;
            if (hand == "LOAD"){
                delete require.cache[require.resolve(file)];
                let module = require(file);
                if (!(isset(module.name)) && !(isset(module.run))) return;
                Bot.caches.eventsCache.append(module.name,module);
                Bot.addEvent(module.name, module.run);
                debug("EVENT LOAD", module.name + " (" + file + ")");
            } else if (hand == "RELOAD"){
                delete require.cache[require.resolve(file)];
                let module = require(file);
                if (!(isset(module.name)) && !(isset(module.run))) return;
                Bot.removeEvent(module.name, Bot.caches.eventsCache.get(module.name).run);
                Bot.caches.eventsCache.remove(module.name);
                Bot.caches.eventsCache.append(module.name, module);
                Bot.addEvent(module.name, module.run);
                debug("EVENT RELOAD", module.name + " (" + file + ")");
            } else if (hand == "REMOVE"){
                let evN = file.split(sep).pop().split(".js")[0];
                Bot.removeEvent(evN, Bot.caches.eventsCache.get(evN).run);
                Bot.caches.eventsCache.remove(evN);
                debug("EVENT REMOVE", evN + " (" + file + ")");
            }
        }

        // Let's add the listeners
        module.exports.defs.CommandsWatcher = PerformWatch(BWFCommands);
        module.exports.defs.CommandsWatcher.on("create", (file) => WatchCMDHandle("LOAD",file));
        module.exports.defs.CommandsWatcher.on("change", (file) => WatchCMDHandle("RELOAD",file));
        module.exports.defs.CommandsWatcher.on("delete", (file) => WatchCMDHandle("REMOVE",file));

        module.exports.defs.EventsWatcher = PerformWatch(BWFEvents);
        module.exports.defs.EventsWatcher.on("create", (file) => WatchEVTHandle("LOAD",file));
        module.exports.defs.EventsWatcher.on("change", (file) => WatchEVTHandle("RELOAD",file));
        module.exports.defs.EventsWatcher.on("delete", (file) => WatchEVTHandle("REMOVE",file));
    },
    stop() {
        module.exports.defs.CommandsWatcher.clear();
        module.exports.defs.EventsWatcher.clear();
    }
}
