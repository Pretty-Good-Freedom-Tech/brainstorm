Consider using DozerDB: https://dozerdb.org to bring Enterprise-grade features to Brainstorm.

## Useful commands:

```bash
ps aux | grep neo4j | grep -o '\-XX:[^[:space:]]*'
```

```bash
sudo jstat -gc <pid> 1000
```

## Install GCViewer tool

# Download and analyze (if you want graphical analysis)
wget https://github.com/chewiebug/GCViewer/releases/download/1.36/gcviewer-1.36.jar
java -jar gcviewer-1.36.jar /var/log/neo4j/gc.log

http://sourceforge.net/projects/gcviewer/files/gcviewer-1.36.jar/download
https://github.com/chewiebug/GCViewer/archive/refs/tags/1.36.zip