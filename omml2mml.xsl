<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet
    version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
    xmlns:mml="http://www.w3.org/1998/Math/MathML"
    exclude-result-prefixes="m">

    <xsl:output method="xml" indent="no" encoding="UTF-8"/>
    <xsl:strip-space elements="*"/>

    <xsl:template match="/">
        <xsl:apply-templates/>
    </xsl:template>

    <xsl:template match="m:oMathPara">
        <mml:math>
            <xsl:apply-templates/>
        </mml:math>
    </xsl:template>

    <xsl:template match="m:oMath">
        <mml:math>
            <xsl:apply-templates/>
        </mml:math>
    </xsl:template>

    <xsl:template match="m:r">
        <xsl:apply-templates/>
    </xsl:template>

    <xsl:template match="m:t">
        <mml:mi>
            <xsl:value-of select="."/>
        </mml:mi>
    </xsl:template>

    <xsl:template match="m:br">
        <mml:mspace/>
    </xsl:template>

    <xsl:template match="m:sSup">
        <mml:msup>
            <xsl:apply-templates select="m:e"/>
            <xsl:apply-templates select="m:sup"/>
        </mml:msup>
    </xsl:template>

    <xsl:template match="m:sSub">
        <mml:msub>
            <xsl:apply-templates select="m:e"/>
            <xsl:apply-templates select="m:sub"/>
        </mml:msub>
    </xsl:template>

    <xsl:template match="m:sSubSup">
        <mml:msubsup>
            <xsl:apply-templates select="m:e"/>
            <xsl:apply-templates select="m:sub"/>
            <xsl:apply-templates select="m:sup"/>
        </mml:msubsup>
    </xsl:template>

    <xsl:template match="m:f">
        <mml:mfrac>
            <xsl:apply-templates select="m:num"/>
            <xsl:apply-templates select="m:den"/>
        </mml:mfrac>
    </xsl:template>

    <xsl:template match="m:rad">
        <xsl:choose>
            <xsl:when test="m:deg">
                <mml:mroot>
                    <xsl:apply-templates select="m:e"/>
                    <xsl:apply-templates select="m:deg"/>
                </mml:mroot>
            </xsl:when>
            <xsl:otherwise>
                <mml:msqrt>
                    <xsl:apply-templates select="m:e"/>
                </mml:msqrt>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template match="m:e | m:num | m:den | m:deg | m:sub | m:sup">
        <xsl:apply-templates/>
    </xsl:template>

    <xsl:template match="m:func | m:lim | m:nary | m:eqArr | m:box | m:bar | m:acc | m:groupChr">
        <mml:mrow>
            <xsl:apply-templates/>
        </mml:mrow>
    </xsl:template>

    <xsl:template match="m:chr">
        <mml:mo>
            <xsl:value-of select="@m:val"/>
        </mml:mo>
    </xsl:template>

    <xsl:template match="m:opEmu | m:ctrlPr | m:rPr | m:naryPr | m:radPr | m:fPr | m:limPr">
        <xsl:apply-templates/>
    </xsl:template>

    <xsl:template match="*">
        <xsl:apply-templates/>
    </xsl:template>
</xsl:stylesheet>
