// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – JSDoc typové definice                              ║
// ║  Tento soubor obsahuje pouze typové komentáře.              ║
// ║  Neexportuje žádný kód – slouží jako reference pro IDE.     ║
// ╚══════════════════════════════════════════════════════════════╝

// ── Základní typy ──

/**
 * @typedef {{x: number, y: number}} Point2D
 */

/**
 * @typedef {{x: number, y: number, snapped?: boolean, snapType?: string}} SnapResult
 */

// ── Vrstvy ──

/**
 * @typedef {Object} Layer
 * @property {number} id
 * @property {string} name
 * @property {string} color
 * @property {boolean} visible
 * @property {boolean} locked
 */

// ── Objekty výkresu ──

/**
 * @typedef {Object} PointObject
 * @property {'point'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} LineObject
 * @property {'line'|'constr'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {boolean} [dashed]
 * @property {boolean} [isDimension]
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 */

/**
 * @typedef {Object} CircleObject
 * @property {'circle'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {number} cx
 * @property {number} cy
 * @property {number} r
 */

/**
 * @typedef {Object} ArcObject
 * @property {'arc'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {number} cx
 * @property {number} cy
 * @property {number} r
 * @property {number} startAngle
 * @property {number} endAngle
 * @property {boolean} [ccw]
 */

/**
 * @typedef {Object} RectObject
 * @property {'rect'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 */

/**
 * @typedef {Object} PolylineObject
 * @property {'polyline'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {Point2D[]} vertices
 * @property {number[]} bulges
 * @property {boolean} closed
 */

/**
 * @typedef {Object} DimensionObject
 * @property {'line'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {boolean} isDimension
 * @property {boolean} [isCoordLabel]
 * @property {boolean} [isMeasureTemp]
 * @property {'linear'|'diameter'|'radius'|'angular'} [dimType] - Typ kóty
 * @property {number} [sourceObjId] - ID zdrojového objektu pro asociativní kóty
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} [dimSrcX1]
 * @property {number} [dimSrcY1]
 * @property {number} [dimSrcX2]
 * @property {number} [dimSrcY2]
 * @property {number} [dimAngle] - Úhel v radiánech (pro úhlovou kótu)
 * @property {number} [dimRadius] - Poloměr (pro radiální/průměrovou kótu)
 * @property {number} [dimCenterX] - Střed kružnice/oblouku (pro radiální/průměrovou)
 * @property {number} [dimCenterY]
 */

/**
 * @typedef {Object} TextObject
 * @property {'text'} type
 * @property {number} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [layer]
 * @property {number} x
 * @property {number} y
 * @property {string} text
 * @property {number} [fontSize]
 * @property {string} [fontFamily]
 * @property {number} [rotation]
 * @property {string} [textAlign]
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 * @property {number} [letterSpacing]
 * @property {string} [pathMode] - 'none'|'line'|'arc'
 * @property {number|null} [pathObjectId] - ID objektu cesty
 */

/**
 * @typedef {PointObject|LineObject|CircleObject|ArcObject|RectObject|PolylineObject|DimensionObject|TextObject} DrawObject
 */

// ── Geometrie – přímky a kružnice pro průsečíky ──

/**
 * @typedef {Object} LineSeg
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {boolean} [isConstr]
 */

/**
 * @typedef {Object} CircleSeg
 * @property {number} cx
 * @property {number} cy
 * @property {number} r
 * @property {number} [startAngle]
 * @property {number} [endAngle]
 */

/**
 * @typedef {Object} TangentLine
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 */

/**
 * @typedef {Object} BulgeArc
 * @property {number} cx
 * @property {number} cy
 * @property {number} r
 * @property {number} startAngle
 * @property {number} endAngle
 * @property {boolean} ccw
 */

// ── Stav aplikace ──

/**
 * @typedef {'select'|'move'|'point'|'line'|'constr'|'circle'|'arc'|'rect'|'polyline'|'measure'|'tangent'|'offset'|'trim'|'extend'|'fillet'|'chamfer'|'filletChamfer'|'perp'|'parallel'|'horizontal'|'dimension'|'deleteObj'|'anchor'|'break'|'centerMark'|'scale'|'mirror'} ToolType
 */

/**
 * @typedef {'abs'|'inc'} CoordMode
 */

/**
 * @typedef {'soustruh'|'karusel'} MachineType
 */

/**
 * @typedef {'radius'|'diameter'} XDisplayMode
 */

/**
 * @typedef {Object} MouseState
 * @property {number} x - World X
 * @property {number} y - World Y
 * @property {number} rawX - Raw world X (bez snapu)
 * @property {number} rawY - Raw world Y (bez snapu)
 * @property {number} sx - Screen X
 * @property {number} sy - Screen Y
 * @property {boolean} snapped
 * @property {string} snapType - 'point' | 'grid' | ''
 */

/**
 * @typedef {Object} AppState
 * @property {DrawObject[]} objects
 * @property {number|null} selected
 * @property {Set<number>} multiSelected
 * @property {ToolType} tool
 * @property {boolean} snapToPoints
 * @property {boolean} snapToGrid
 * @property {boolean} angleSnap
 * @property {number} angleSnapStep
 * @property {number} gridSize
 * @property {number} zoom
 * @property {number} panX
 * @property {number} panY
 * @property {boolean} drawing
 * @property {Point2D[]} tempPoints
 * @property {MouseState} mouse
 * @property {Point2D[]} intersections
 * @property {number} nextId
 * @property {'all'|'intersections'|'none'} showDimensions
 * @property {DrawObject[]} undoStack
 * @property {DrawObject[]} redoStack
 * @property {number} maxUndo
 * @property {boolean} dragging
 * @property {number|null} dragObjIdx
 * @property {Point2D|null} dragStartWorld
 * @property {string|null} dragObjSnapshot
 * @property {DrawObject|null} clipboard
 * @property {{x: number|null, y: number|null}} numDialogChain
 * @property {CoordMode} coordMode
 * @property {Point2D} incReference
 * @property {MachineType} machineType
 * @property {XDisplayMode} xDisplayMode
 * @property {string} projectName
 * @property {Layer[]} layers
 * @property {number} activeLayer
 * @property {number} nextLayerId
 */

// ── Uložený projekt ──

/**
 * @typedef {Object} ProjectData
 * @property {number} version
 * @property {DrawObject[]} objects
 * @property {Point2D[]} intersections
 * @property {number} nextId
 * @property {number} gridSize
 * @property {CoordMode} [coordMode]
 * @property {Point2D} [incReference]
 * @property {Layer[]} [layers]
 * @property {number} [activeLayer]
 * @property {number} [nextLayerId]
 */

// ── DXF import ──

/**
 * @typedef {Object} DXFParseResult
 * @property {Object[]} entities
 * @property {string[]} errors
 */

// ── Bridge callbacky ──

/**
 * @typedef {Object} Bridge
 * @property {Function|null} updateMobileCancelBtn
 * @property {Function|null} updateMobileCoords
 * @property {Function|null} updateProperties
 * @property {Function|null} updateObjectList
 * @property {Function|null} updateIntersectionList
 * @property {Function|null} calculateAllIntersections
 * @property {Function|null} updateLayerList
 */
