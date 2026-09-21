import QtQuick
import "../services"

Item {
    id: root

    property color backgroundColor: "#0b0e0c"
    property color accentColor: "#6791a9"
    property real cornerRadius: width * 0.225
    property real strokeWidth: Math.max(1, width * 0.018)
    property real horizontalInset: width * 0.075
    property real verticalInset: width * 0.065
    property int revealDelay: 0
    property real revealDistance: width * 0.22
    property real revealVerticalDistance: width * 0.08
    property bool contextExpanded: false
    property real compactHeight: 0
    property real contextTargetHeight: 0

    default property alias content: contentItem.data

    opacity: 0

    transform: Translate {
        id: revealTransform
        x: -root.revealDistance
        y: root.revealVerticalDistance
    }

    function reveal() {
        if (SettingsService.animations) revealAnimation.start()
        else { opacity = 1; revealTransform.x = 0; revealTransform.y = 0 }
    }
    Component.onCompleted: if (SettingsService.ready) reveal()
    Connections {
        target: SettingsService
        function onReadyChanged() { if (SettingsService.ready) root.reveal() }
        function onAnimationsChanged() {
            if (!SettingsService.animations) {
                revealAnimation.stop(); root.opacity = 1; revealTransform.x = 0; revealTransform.y = 0
            }
        }
    }

    ParallelAnimation {
        id: revealAnimation

        SequentialAnimation {
            PauseAnimation { duration: root.revealDelay }
            NumberAnimation {
                target: root
                property: "opacity"
                from: 0
                to: 1
                duration: 190
                easing.type: Easing.OutCubic
            }
        }

        SequentialAnimation {
            PauseAnimation { duration: root.revealDelay }
            ParallelAnimation {
                NumberAnimation {
                    target: revealTransform
                    property: "x"
                    from: -root.revealDistance
                    to: 0
                    duration: 260
                    easing.type: Easing.OutCubic
                }
                NumberAnimation {
                    target: revealTransform
                    property: "y"
                    from: root.revealVerticalDistance
                    to: 0
                    duration: 300
                    easing.type: Easing.OutCubic
                }
            }
        }
    }

    Behavior on height {
        enabled: SettingsService.animations
        NumberAnimation {
            duration: 175
            easing.type: Easing.OutCubic
        }
    }

    // Extend the rounded shell past the left monitor edge. No outline is drawn;
    // the island is defined only by its Pywal background surface.
    Rectangle {
        x: -root.cornerRadius
        y: 0
        width: root.width + root.cornerRadius
        height: root.height
        radius: root.cornerRadius
        color: root.backgroundColor
        border.width: 0
        antialiasing: true
    }

    Item {
        id: contentItem
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: root.horizontalInset
        anchors.rightMargin: root.horizontalInset
        height: root.contextExpanded && root.compactHeight > 0
            ? Math.max(0, root.compactHeight - root.verticalInset * 2)
            : Math.max(0, root.height - root.verticalInset * 2)
        y: root.contextExpanded
            ? Math.max(root.verticalInset, (root.height - height) / 2)
            : root.verticalInset
    }
}
