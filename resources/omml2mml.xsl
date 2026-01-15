<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
    xmlns:mml="http://www.w3.org/1998/Math/MathML"
    exclude-result-prefixes="m">

  <xsl:output method="xml" encoding="UTF-8" indent="no"/>

  <xsl:template match="/">
    <xsl:apply-templates select="//m:oMath"/>
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
    <xsl:choose>
      <xsl:when test="translate(., '0123456789', '') = ''">
        <mml:mn><xsl:value-of select="."/></mml:mn>
      </xsl:when>
      <xsl:otherwise>
        <mml:mi><xsl:value-of select="."/></mml:mi>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="m:frac">
    <mml:mfrac>
      <xsl:apply-templates select="m:num"/>
      <xsl:apply-templates select="m:den"/>
    </mml:mfrac>
  </xsl:template>

  <xsl:template match="m:num|m:den">
    <mml:mrow>
      <xsl:apply-templates/>
    </mml:mrow>
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

  <xsl:template match="m:deg|m:e|m:sub|m:sup">
    <mml:mrow>
      <xsl:apply-templates/>
    </mml:mrow>
  </xsl:template>

  <xsl:template match="m:limLow">
    <mml:munder>
      <xsl:apply-templates select="m:e"/>
      <xsl:apply-templates select="m:lim"/>
    </mml:munder>
  </xsl:template>

  <xsl:template match="m:limUpp">
    <mml:mover>
      <xsl:apply-templates select="m:e"/>
      <xsl:apply-templates select="m:lim"/>
    </mml:mover>
  </xsl:template>

  <xsl:template match="m:bar">
    <mml:mover>
      <xsl:apply-templates select="m:e"/>
      <mml:mo>&#x00AF;</mml:mo>
    </mml:mover>
  </xsl:template>

  <xsl:template match="m:nary">
    <mml:munderover>
      <mml:mo><xsl:value-of select="m:chr/m:t"/></mml:mo>
      <xsl:apply-templates select="m:sub"/>
      <xsl:apply-templates select="m:sup"/>
    </mml:munderover>
    <xsl:apply-templates select="m:e"/>
  </xsl:template>

  <xsl:template match="m:func">
    <mml:mrow>
      <xsl:apply-templates/>
    </mml:mrow>
  </xsl:template>

  <xsl:template match="m:f">
    <mml:mrow>
      <xsl:apply-templates/>
    </mml:mrow>
  </xsl:template>

  <xsl:template match="m:lim">
    <mml:mrow>
      <xsl:apply-templates/>
    </mml:mrow>
  </xsl:template>

  <xsl:template match="m:box|m:phant|m:groupChr|m:eqArr|m:acc">
    <mml:mrow>
      <xsl:apply-templates/>
    </mml:mrow>
  </xsl:template>

  <xsl:template match="text()">
    <mml:mi><xsl:value-of select="."/></mml:mi>
  </xsl:template>

</xsl:stylesheet>
