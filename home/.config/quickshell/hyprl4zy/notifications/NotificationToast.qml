import QtQuick
import Quickshell
import "../components"
import "../services"

Item {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    property var entry: null
    property var displayEntry: null
    property bool attachedToTop: false
    property bool presented: false
    property bool expanded: false
    property bool contentRevealed: false
    property string currentIdentity: ""

    visible: displayEntry !== null
    width: parent ? parent.width : unit * 7.0
    height: visible ? content.implicitHeight + unit * 0.34 : 0

    function iconSource() {
        const icon = String(displayEntry && displayEntry.appIcon ? displayEntry.appIcon : "")
        if (!icon.length) return ""
        if (icon.indexOf("file:") === 0 || icon.indexOf("image:") === 0 || icon.indexOf("qrc:") === 0) return icon
        if (icon[0] === "/") return "file://" + icon
        return Quickshell.iconPath(icon, true)
    }

    function imageSource() {
        const image = String(displayEntry && displayEntry.image ? displayEntry.image : "")
        if (!image.length) return ""
        if (image.indexOf("file:") === 0 || image.indexOf("image:") === 0 || image.indexOf("http:") === 0 || image.indexOf("https:") === 0) return image
        if (image[0] === "/") return "file://" + image
        return image
    }

    function syncEntry() {
        if (!entry) {
            expiryTimer.stop(); expandTimer.stop(); contentTimer.stop()
            if (displayEntry) {
                contentRevealed = false
                expanded = false
                if (SettingsService.animations) exitLiftTimer.restart()
                else { presented = false; clearTimer.restart() }
            } else currentIdentity = ""
            return
        }

        clearTimer.stop(); exitLiftTimer.stop(); expandTimer.stop(); contentTimer.stop()
        const nextIdentity = String(entry.identity || "")
        const sameIdentity = currentIdentity.length > 0 && currentIdentity === nextIdentity
        currentIdentity = nextIdentity
        displayEntry = entry

        if (!sameIdentity) {
            presented = false; expanded = false; contentRevealed = false
            Qt.callLater(function() {
                root.presented = true
                if (SettingsService.animations) expandTimer.restart()
                else { root.expanded = true; root.contentRevealed = true }
            })
        } else {
            presented = true; expanded = true; contentRevealed = true
        }
        expiryTimer.restart()
    }

    onEntryChanged: syncEntry()
    Component.onCompleted: syncEntry()

    opacity: root.displayEntry !== null ? 1 : 0

    transform: Translate {
        y: root.presented ? 0 : -(root.height + root.unit * 0.46)
        Behavior on y {
            NumberAnimation {
                duration: SettingsService.animations ? (root.presented ? 235 : 185) : 0
                easing.type: root.presented ? Easing.OutCubic : Easing.InCubic
            }
        }
    }

    Item {
        id: card
        anchors.horizontalCenter: parent.horizontalCenter
        width: root.expanded ? root.width : Math.min(root.width, Math.max(root.height, root.unit * 1.05))
        height: root.height
        clip: true

        Behavior on width {
            enabled: SettingsService.animations
            NumberAnimation { duration: root.expanded ? 250 : 245; easing.type: Easing.OutCubic }
        }

        TopSheetSurface {
            anchors.fill: parent
            backgroundColor: root.backgroundColor
            accentColor: root.accentColor
            borderColor: root.backgroundColor
            borderWidth: Math.max(1, root.unit * 0.025)
            radius: root.unit * 0.30
            attachedToTop: root.attachedToTop
        }

        Text {
            anchors.centerIn: parent
            text: ""
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.34, root.unit)
            font.weight: Font.DemiBold
            opacity: root.expanded ? 0 : 1
            z: 5

            Behavior on opacity {
                enabled: SettingsService.animations
                NumberAnimation { duration: 100; easing.type: Easing.OutCubic }
            }
        }

        Column {
            id: content
            width: root.width - root.unit * 0.40
            x: (card.width - root.width) / 2 + root.unit * 0.20
            y: root.attachedToTop ? root.unit * 0.21 : root.unit * 0.19
            opacity: root.contentRevealed ? 1 : 0
            spacing: root.unit * 0.10

            Behavior on opacity {
                enabled: SettingsService.animations
                NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
            }

            Row {
                width: parent.width
                spacing: root.unit * 0.14

                Rectangle {
                    id: visualTile
                    width: root.displayEntry && root.displayEntry.isMedia ? root.unit * 0.96 : root.unit * 0.60
                    height: width
                    radius: root.displayEntry && root.displayEntry.isMedia ? root.unit * 0.18 : root.unit * 0.14
                    color: root.surfaceColor
                    clip: true
                    visible: mediaArt.source.toString().length > 0 || iconImage.source.toString().length > 0

                    Image {
                        id: mediaArt
                        anchors.fill: parent
                        source: root.displayEntry && root.displayEntry.isMedia ? root.imageSource() : ""
                        fillMode: Image.PreserveAspectCrop
                        smooth: true
                        mipmap: true
                        visible: source.toString().length > 0 && status !== Image.Error
                    }

                    Image {
                        id: iconImage
                        anchors.centerIn: parent
                        width: parent.width * (root.displayEntry && root.displayEntry.isMedia ? 0.46 : 0.68)
                        height: width
                        source: mediaArt.visible ? "" : root.iconSource()
                        fillMode: Image.PreserveAspectFit
                        smooth: true
                        mipmap: true
                    }

                    Text {
                        anchors.centerIn: parent
                        visible: root.displayEntry && root.displayEntry.isMedia && !mediaArt.visible && iconImage.source.toString().length === 0
                        text: "♪"
                        color: root.accentColor
                        font.pixelSize: UiScale.text(root.unit * 0.30, root.unit)
                        font.weight: Font.Bold
                    }
                }

                Column {
                    width: parent.width
                        - (visualTile.visible ? visualTile.width + root.unit * 0.14 : 0)
                        - (root.displayEntry && root.displayEntry.isOsd ? 0 : closeButton.width + root.unit * 0.10)
                    spacing: root.unit * 0.025

                    Row {
                        width: parent.width
                        spacing: root.unit * 0.06

                        Rectangle {
                            visible: root.displayEntry && root.displayEntry.isMedia
                            width: mediaLabel.implicitWidth + root.unit * 0.18
                            height: root.unit * 0.23
                            radius: height / 2
                            color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.16)
                            Text {
                                id: mediaLabel
                                anchors.centerIn: parent
                                text: "NOW PLAYING"
                                color: root.accentColor
                                font.pixelSize: UiScale.text(root.unit * 0.075, root.unit)
                                font.weight: Font.Bold
                            }
                        }

                        Text {
                            width: Math.max(0, parent.width - (root.displayEntry && root.displayEntry.isMedia ? mediaLabel.implicitWidth + root.unit * 0.24 : 0))
                            text: root.displayEntry ? root.displayEntry.appName : ""
                            color: root.accentColor
                            font.pixelSize: UiScale.text(root.unit * 0.100, root.unit)
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                            textFormat: Text.PlainText
                        }
                    }

                    Text {
                        width: parent.width
                        text: root.displayEntry ? root.displayEntry.summary : ""
                        color: root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * (root.displayEntry && root.displayEntry.isMedia ? 0.19 : 0.18), root.unit)
                        font.weight: Font.Bold
                        wrapMode: Text.Wrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                        textFormat: Text.PlainText
                    }

                    Text {
                        visible: text.length > 0
                        width: parent.width
                        text: root.displayEntry ? root.displayEntry.body : ""
                        color: root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.115, root.unit)
                        wrapMode: Text.Wrap
                        maximumLineCount: root.displayEntry && root.displayEntry.isMedia ? 2 : 3
                        elide: Text.ElideRight
                        textFormat: Text.PlainText
                    }
                }

                Rectangle {
                    id: closeButton
                    visible: root.displayEntry && !root.displayEntry.isOsd
                    width: root.unit * 0.36
                    height: width
                    radius: width / 2
                    color: root.surfaceColor
                    Text { anchors.centerIn: parent; text: "×"; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.17, root.unit); font.weight: Font.Bold }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: if (root.displayEntry) NotificationService.dismiss(root.displayEntry.id) }
                }
            }

            Rectangle {
                visible: root.displayEntry && root.displayEntry.progressValue >= 0
                width: parent.width
                height: Math.max(2, root.unit * 0.045)
                radius: height / 2
                color: root.surfaceColor
                Rectangle {
                    width: parent.width * Math.max(0, Math.min(1, Number(root.displayEntry ? root.displayEntry.progressValue : 0) / 100))
                    height: parent.height
                    radius: parent.radius
                    color: root.accentColor
                }
            }

            Row {
                visible: root.displayEntry && root.displayEntry.isMedia
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: root.unit * 0.08

                Repeater {
                    model: ["PREV", NotificationService.mediaPlaying ? "PAUSE" : "PLAY", "NEXT"]
                    delegate: Rectangle {
                        required property var modelData
                        required property int index
                        width: index === 1 ? root.unit * 1.02 : root.unit * 0.80
                        height: root.unit * 0.34
                        radius: height / 2
                        color: index === 1
                            ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.16)
                            : root.surfaceColor
                        opacity: index === 0 ? (NotificationService.mediaCanPrevious ? 1 : 0.4)
                            : index === 2 ? (NotificationService.mediaCanNext ? 1 : 0.4)
                            : (NotificationService.mediaCanToggle ? 1 : 0.4)
                        Text { anchors.centerIn: parent; text: modelData; color: index === 1 ? root.accentColor : root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.085, root.unit); font.weight: Font.Bold }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (index === 0) NotificationService.mediaPrevious()
                                else if (index === 1) NotificationService.mediaToggle()
                                else NotificationService.mediaNext()
                            }
                        }
                    }
                }
            }

            Row {
                visible: root.displayEntry && !root.displayEntry.isMedia
                    && root.displayEntry.notification
                    && root.displayEntry.notification.actions
                    && root.displayEntry.notification.actions.length > 0
                spacing: root.unit * 0.06
                Repeater {
                    model: root.displayEntry && root.displayEntry.notification ? root.displayEntry.notification.actions : []
                    delegate: Rectangle {
                        required property var modelData
                        required property int index
                        width: Math.min(root.unit * 2.25, actionText.implicitWidth + root.unit * 0.28)
                        height: root.unit * 0.38
                        radius: root.unit * 0.10
                        color: root.surfaceColor
                        Text { id: actionText; anchors.centerIn: parent; text: modelData.text; color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.105, root.unit); font.weight: Font.DemiBold }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: if (root.displayEntry) NotificationService.invokeAction(root.displayEntry.id, index) }
                    }
                }
            }
        }
    }

    Timer { id: expandTimer; interval: 242; repeat: false; onTriggered: { root.expanded = true; contentTimer.restart() } }
    Timer { id: contentTimer; interval: 135; repeat: false; onTriggered: root.contentRevealed = true }
    Timer { id: exitLiftTimer; interval: 240; repeat: false; onTriggered: { root.presented = false; clearTimer.restart() } }
    Timer { id: expiryTimer; interval: root.displayEntry ? Math.max(1, Number(root.displayEntry.timeoutMs) || 1) : 1; repeat: false; onTriggered: if (root.displayEntry) NotificationService.expireSerial(root.displayEntry.id, root.displayEntry.serial) }
    Timer { id: clearTimer; interval: SettingsService.animations ? 235 : 1; repeat: false; onTriggered: { if (root.entry === null) { root.displayEntry = null; root.currentIdentity = "" } } }
}
