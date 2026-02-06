#!/bin/bash

VERSION_FILE="VERSION.txt"

# Versiyon dosyası yoksa 1 ile başlat
if [ ! -f "$VERSION_FILE" ]; then
    echo "1" > "$VERSION_FILE"
fi

# Mevcut versiyonu oku ve artır
CURRENT_VERSION=$(cat "$VERSION_FILE")
NEW_VERSION=$((CURRENT_VERSION + 1))
echo "$NEW_VERSION" > "$VERSION_FILE"

# Commit mesajı parametresi (boşsa "Update" kullan)
COMMIT_MSG=${1:-"Mutfak çalışması / Düzenlemeler"}

# Git işlemleri
git add .
git commit -m "v$NEW_VERSION: $COMMIT_MSG"
git push

echo "--------------------------------------"
echo "🚀 Başarıyla Pushlandı! Yeni Versiyon: v$NEW_VERSION"
echo "📝 Mesaj: v$NEW_VERSION: $COMMIT_MSG"
echo "--------------------------------------"
