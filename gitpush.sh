#!/bin/bash

# Renk tanımları
RESET="\033[0m"
BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"

VERSION_FILE="VERSION.txt"

# SemVer kontrolü
if [ ! -f "$VERSION_FILE" ]; then
    echo "1.0.0" > "$VERSION_FILE"
fi

CURRENT_VERSION=$(cat "$VERSION_FILE")
# Versiyonu parçala
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

echo -e "${CYAN}${BOLD}Mevcut Versiyon: v$CURRENT_VERSION${RESET}"
echo -e "${YELLOW}Güncelleme Tipini Seçin:${RESET}"
echo -e "1) ${BOLD}Major${RESET} (Büyük değişiklikler: v$((MAJOR+1)).0.0)"
echo -e "2) ${BOLD}Minor${RESET} (Yeni özellikler: v$MAJOR.$((MINOR+1)).0)"
echo -e "3) ${BOLD}Patch${RESET} (Hata düzeltmeleri/Stabilite: v$MAJOR.$MINOR.$((PATCH+1)))"
read -p "Seçiminiz [1-3]: " CHOICE

case $CHOICE in
    1)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    2)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    3)
        PATCH=$((PATCH + 1))
        ;;
    *)
        echo -e "${RED}Geçersiz seçim. İşlem iptal edildi.${RESET}"
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "$NEW_VERSION" > "$VERSION_FILE"

# Commit mesajını sor
echo -e "${CYAN}Commit mesajını girin:${RESET} "
read MSG

if [ -z "$MSG" ]; then
    MSG="v$NEW_VERSION güncellemeleri"
fi

# Git işlemleri
git add .
git commit -m "v$NEW_VERSION: $MSG"
git push

echo -e "\n${GREEN}${BOLD}--------------------------------------"
echo -e "🚀 Başarıyla Pushlandı! Sürüm: v$NEW_VERSION"
echo -e "📝 Mesaj: v$NEW_VERSION: $MSG"
echo -e "--------------------------------------${RESET}"
